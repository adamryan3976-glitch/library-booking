/**
 * Winchester P.S. Library Booking — Google Apps Script backend (BookingApi.gs).
 *
 * This is its OWN Apps Script project (script.google.com → New project), kept
 * separate from the Library Today / Today-sheet / Home Assistant script so the
 * two never clash. It opens the booking Google Sheet by ID and keeps its data
 * in tabs whose names start with "App ". Booking rules are in BookingCore.gs.
 *
 * Every booking is ALSO written to "Form Responses 2" in the same format the
 * old Google Form used, so the weekly tabs, the Today tab, Library Today and
 * the Home Assistant feed keep working without changes.
 *
 * First-time setup: run setup() once, then deploy as a Web app. See README.md.
 */

// The "Winchester Library Booking" spreadsheet.
var SPREADSHEET_ID = '1g00WwPXI8JPcSI7WjnOhdygyihbAscBuzXVl1b9JaWo';

// Sign in with Google. Paste the same OAuth Client ID that's in the website's
// assets/config.js. Leave it '' to let teachers type their email instead.
var GOOGLE_CLIENT_ID = '241712157669-1huukafbcpsifc4v35op6o80qjb10r0r.apps.googleusercontent.com';

// Copy bookings into the old Form's response tab so existing formulas see them.
// Set to '' to stop doing this (e.g. once the weekly tabs are retired).
var FORM_MIRROR_SHEET = 'Form Responses 2';

var SHEETS = {
  bookings: 'App Bookings',
  statics: 'App Static Bookings',
  calendar: 'App Calendar',
  librarian: 'App Librarian Schedule',
  settings: 'App Settings',
  staff: 'App Staff'
};
var STAFF_COLS = ['email', 'name', 'status', 'requested', 'decided', 'note'];
var STAFF_HEADERS = ['Email', 'Name', 'Status (approved / pending / denied)', 'Requested', 'Decided', 'Note'];

var BOOKING_COLS = ['id', 'groupId', 'created', 'email', 'teachers', 'grades', 'space', 'date', 'slot',
  'description', 'status', 'token', 'source', 'cancelledAt'];
var BOOKING_HEADERS = ['ID', 'Group ID', 'Created', 'Email', 'Teacher(s)', 'Grade(s)', 'Space', 'Date', 'Slot',
  'Description', 'Status', 'Cancel Token', 'Source', 'Cancelled At'];

// ---------------------------------------------------------------- Web app

function doGet(e) {
  var p = (e && e.parameter) || {};
  return respond(p.action || 'init', p);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { body = {}; }
  return respond(body.action, body);
}

// With Google sign-in on, every teacher-side request needs a signed-in @domain account.
// The admin page can still read the calendar with its passcode.
var READ_ACTIONS = { init: true, bookings: true };

function respond(action, payload) {
  var out;
  try {
    payload = payload || {};
    var idToken = payload.idToken;
    delete payload.idToken;
    delete payload.authEmail; // only ever set here, from a verified Google sign-in
    var isAdmin = String(action).indexOf('admin') === 0;
    if (isAdmin) throttleAdmin_(payload);
    if (GOOGLE_CLIENT_ID && !isAdmin) {
      var adminView = false;
      if (READ_ACTIONS[action] && payload.passcode) {
        throttleAdmin_(payload);
        adminView = Store.checkPasscode(String(payload.passcode));
      }
      if (!adminView) {
        if (!idToken) throw authError_('Sign in with your school Google account to continue.');
        var email = verifyIdToken_(idToken).email;
        var domain = String(Store.getSettings().emailDomain || '').toLowerCase();
        if (domain && email.slice(-(domain.length + 1)) !== '@' + domain) {
          throw authError_('Please sign in with your @' + domain + ' Google account.');
        }
        payload.authEmail = email;
        payload.email = email;
      }
    }

    out = { ok: true, data: Core.handle(action, payload, Store, now_()) };
  } catch (e) {
    out = { ok: false, error: e.userFacing ? e.message : 'Something went wrong on the server: ' + e.message };
    if (e.authRequired) out.auth = true;
    if (e.access) out.access = e.access;
    if (!e.userFacing) console.error(e);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function tz_() {
  if (!tz_.v) tz_.v = Store.ss().getSpreadsheetTimeZone() || 'America/Toronto';
  return tz_.v;
}

function now_() {
  var tz = tz_();
  var d = new Date();
  return {
    date: Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
    minutes: +Utilities.formatDate(d, tz, 'H') * 60 + +Utilities.formatDate(d, tz, 'm'),
    stamp: Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss')
  };
}

function authError_(msg) { var e = new Error(msg); e.userFacing = true; e.authRequired = true; return e; }

/**
 * Checks a Google sign-in ID token with Google and returns { email, name }.
 * Results are cached until the token expires (about an hour), so this only
 * calls Google once per sign-in.
 */
function verifyIdToken_(token) {
  var cache = CacheService.getScriptCache();
  var key = 'id_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('Your sign-in has expired. Please sign in again.');
  var info = JSON.parse(res.getContentText());
  var secsLeft = Math.floor(+info.exp - Date.now() / 1000);
  if (info.aud !== GOOGLE_CLIENT_ID) throw authError_('This sign-in is for a different app. Please sign in again.');
  if (String(info.email_verified) !== 'true' || !info.email) throw authError_('Your Google account email isn’t verified.');
  if (!(secsLeft > 0)) throw authError_('Your sign-in has expired. Please sign in again.');
  var who = { email: String(info.email).toLowerCase(), name: info.name || '' };
  if (secsLeft > 30) cache.put(key, JSON.stringify(who), Math.min(secsLeft, 21600));
  return who;
}

/** Slow down passcode guessing: max 20 admin calls with a wrong passcode per 10 minutes. */
function throttleAdmin_(p) {
  var cache = CacheService.getScriptCache();
  var fails = +(cache.get('adminFails') || 0);
  if (fails >= 20) { var e = new Error('Too many wrong passcodes. Try again in 10 minutes.'); e.userFacing = true; throw e; }
  if (!Store.checkPasscode(String(p.passcode || ''))) cache.put('adminFails', String(fails + 1), 600);
}

// ---------------------------------------------------------------- Storage

var Store = {
  ss: function () {
    if (!this._ss) this._ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return this._ss;
  },
  sheet: function (name) {
    var sh = this.ss().getSheetByName(name);
    if (!sh) throw new Error('Missing tab "' + name + '". Run setup() in the Apps Script editor.');
    return sh;
  },

  // Settings: one row per key, value stored as JSON.
  getSettings: function () {
    var rows = this.sheet(SHEETS.settings).getDataRange().getValues().slice(1);
    var s = JSON.parse(JSON.stringify(Core.DEFAULT_SETTINGS));
    rows.forEach(function (r) {
      if (!r[0]) return;
      try { s[r[0]] = JSON.parse(r[1]); } catch (e) { s[r[0]] = r[1]; }
    });
    return s;
  },
  saveSettings: function (s) {
    var sh = this.sheet(SHEETS.settings);
    var rows = Object.keys(s).map(function (k) { return [k, JSON.stringify(s[k])]; });
    sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).clearContent();
    sh.getRange(2, 1, rows.length, 2).setValues(rows);
  },

  getCalendar: function () {
    return this.sheet(SHEETS.calendar).getDataRange().getValues().slice(1).filter(function (r) { return r[0]; })
      .map(function (r) {
        return { start: dateStr_(r[0]), end: dateStr_(r[1]) || dateStr_(r[0]), label: String(r[2] || ''),
          type: String(r[3]).toLowerCase() === 'closed' ? 'Closed' : 'Event', setDay: parseInt(r[4], 10) || '' };
      });
  },
  saveCalendar: function (cal) {
    writeTable_(this.sheet(SHEETS.calendar), cal.map(function (c) { return [c.start, c.end, c.label, c.type, c.setDay]; }), 5);
  },

  getStatics: function () {
    return this.sheet(SHEETS.statics).getDataRange().getValues().slice(1).filter(function (r) { return r[0] && r[5]; })
      .map(function (r) {
        var repeat = String(r[1] || 'cycle').toLowerCase();
        return { id: String(r[0]), repeat: repeat,
          days: String(r[2]).split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }),
          slots: String(r[3]).split(',').map(function (x) { return x.trim(); }).filter(String),
          space: String(r[4] || ''), label: String(r[5]), start: dateStr_(r[6]), end: dateStr_(r[7]) };
      });
  },
  saveStatics: function (list) {
    writeTable_(this.sheet(SHEETS.statics), list.map(function (s) {
      return [s.id, s.repeat, s.days.join(', '), s.slots.join(', '), s.space, s.label, s.start, s.end];
    }), 8);
  },

  // Librarian schedule: rows are slots, columns are Day 1..N.
  getLibrarian: function () {
    var rows = this.sheet(SHEETS.librarian).getDataRange().getValues().slice(1);
    var out = {};
    rows.forEach(function (r) { if (r[0]) out[r[0]] = r.slice(1).map(function (x) { return String(x || ''); }); });
    return out;
  },
  saveLibrarian: function (grid) {
    var len = Core.DEFAULT_SETTINGS.cycleLength;
    var s = this.getSettings(); len = s.cycleLength || len;
    var sh = this.sheet(SHEETS.librarian);
    var header = ['Slot']; for (var i = 1; i <= len; i++) header.push('Day ' + i);
    var rows = s.slots.map(function (sl) {
      var r = [sl.name]; var v = grid[sl.name] || [];
      for (var i = 0; i < len; i++) r.push(v[i] || ''); return r;
    });
    sh.clearContents();
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  },

  getBookings: function () {
    var values = this.sheet(SHEETS.bookings).getDataRange().getValues().slice(1);
    return values.map(function (r, i) {
      if (!r[0]) return null;
      var b = { _row: i + 2 };
      BOOKING_COLS.forEach(function (k, j) { b[k] = r[j] instanceof Date ? stamp_(r[j], k) : String(r[j]); });
      return b;
    }).filter(Boolean);
  },
  appendBookings: function (rows) {
    var sh = this.sheet(SHEETS.bookings);
    var values = rows.map(function (b) { return BOOKING_COLS.map(function (k) { return b[k] == null ? '' : b[k]; }); });
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, values.length, BOOKING_COLS.length).setNumberFormat('@').setValues(values);
    if (!this._noMirror) mirrorToForm_(rows);
  },
  updateBookings: function (rows) {
    var sh = this.sheet(SHEETS.bookings);
    rows.forEach(function (b) {
      sh.getRange(b._row, 1, 1, BOOKING_COLS.length)
        .setValues([BOOKING_COLS.map(function (k) { return b[k] == null ? '' : b[k]; })]);
    });
    mirrorToForm_(rows);
  },

  // Approved staff list. The tab is created the first time it's needed.
  staffSheet: function () {
    var ss = this.ss(), sh = ss.getSheetByName(SHEETS.staff);
    if (!sh) {
      sh = ss.insertSheet(SHEETS.staff);
      sh.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]).setFontWeight('bold').setBackground('#e8eaf2');
      sh.setFrozenRows(1);
    }
    return sh;
  },
  getStaff: function () {
    if (this._staff) return this._staff;
    var rows = this.staffSheet().getDataRange().getValues().slice(1);
    this._staff = rows.filter(function (r) { return r[0]; }).map(function (r) {
      var o = {};
      STAFF_COLS.forEach(function (k, j) { o[k] = r[j] instanceof Date ? stamp_(r[j], k) : String(r[j]).trim(); });
      o.email = o.email.toLowerCase();
      o.status = (o.status || 'pending').toLowerCase();
      return o;
    });
    return this._staff;
  },
  saveStaff: function (list) {
    this._staff = list;
    var rows = list.map(function (o) { return STAFF_COLS.map(function (k) { return o[k] == null ? '' : o[k]; }); });
    writeTable_(this.staffSheet(), rows, STAFF_COLS.length);
  },

  checkPasscode: function (p) {
    var real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
    return !!real && p === real;
  },
  setPasscode: function (p) { PropertiesService.getScriptProperties().setProperty('ADMIN_PASSCODE', p); },

  sendMail: function (to, subject, body) {
    var s = this.getSettings();
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: s.schoolName + ' Library' });
  },

  newId: function () { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); },

  withLock: function (fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return fn(); } finally { lock.releaseLock(); }
  }
};

function dateStr_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v).trim();
}
function stamp_(d, key) {
  var tz = tz_();
  return key === 'date' ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss');
}
function writeTable_(sh, rows, width) {
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, width).setNumberFormat('@').setValues(rows);
}

// ---------------------------------------------------------------- One-time setup

/**
 * Run once from the editor (select "setup" → Run). Creates the App tabs with
 * starting data, and sets the admin passcode to "changeme" if none exists.
 * Safe to run again: it never overwrites tabs that already exist.
 */
function setup() {
  var ss = Store.ss();

  function make(name, header, rows) {
    if (ss.getSheetByName(name)) return false;
    var sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e8eaf2');
    sh.setFrozenRows(1);
    if (rows && rows.length) sh.getRange(2, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
    return true;
  }

  var d = Core.DEFAULT_SETTINGS;
  make(SHEETS.settings, ['Key', 'Value (JSON) — edit these on the website admin page'],
    Object.keys(d).map(function (k) { return [k, JSON.stringify(d[k])]; }));
  make(SHEETS.bookings, BOOKING_HEADERS, []);
  ss.getSheetByName(SHEETS.bookings).getRange('A:N').setNumberFormat('@');
  make(SHEETS.calendar, ['Start Date', 'End Date', 'Label', 'Type (Closed / Event)', 'Set Cycle Day'],
    Core.DEFAULT_CALENDAR.map(function (c) { return [c.start, c.end, c.label, c.type, c.setDay || '']; }));
  make(SHEETS.statics, ['ID', 'Repeat (cycle / weekday / date)', 'Days', 'Slots', 'Space (blank = all)', 'Label', 'From', 'Until'],
    Core.DEFAULT_STATICS.map(function (s) { return [s.id, s.repeat, s.days.join(', '), s.slots.join(', '), s.space, s.label, s.start, s.end]; }));
  if (!ss.getSheetByName(SHEETS.librarian)) {
    ss.insertSheet(SHEETS.librarian);
    Store.saveLibrarian(Core.DEFAULT_LIBRARIAN);
    ss.getSheetByName(SHEETS.librarian).setFrozenRows(1);
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSCODE')) props.setProperty('ADMIN_PASSCODE', 'changeme');
  Logger.log('Setup complete. Admin passcode is "%s" until you change it on the admin page.',
    props.getProperty('ADMIN_PASSCODE') === 'changeme' ? 'changeme' : '(already set)');
}

/**
 * Optional: copy upcoming bookings from the old Google Form ("Form Responses 2")
 * into the new system. Only bookings dated today or later are copied. Run once.
 * Anything that conflicts or can't be read is listed in the log instead.
 */
function importFormResponses() {
  var sh = Store.ss().getSheetByName('Form Responses 2');
  if (!sh) throw new Error('No "Form Responses 2" tab found.');
  var now = now_();
  var settings = Store.getSettings();
  var existing = Store.getBookings().filter(function (b) { return b.status === 'active'; });
  var taken = {};
  existing.forEach(function (b) { taken[b.date + '|' + b.slot + '|' + b.space] = true; });
  var rows = [], skipped = [];
  sh.getDataRange().getValues().slice(1).forEach(function (r, i) {
    var date = dateStr_(r[5]);
    if (!Core.isDateStr(date) || date < now.date) return;
    var space = settings.spaces.indexOf(String(r[4])) >= 0 ? String(r[4]) : settings.spaces[0];
    var groupId = Store.newId(), token = Store.newId() + Store.newId();
    String(r[6]).split(',').map(function (x) { return x.trim(); }).filter(String).forEach(function (slot) {
      var key = date + '|' + slot + '|' + space;
      if (taken[key]) { skipped.push('Row ' + (i + 2) + ': ' + date + ' ' + slot + ' already booked'); return; }
      if (Core.slotIndex(settings, slot) === 999) { skipped.push('Row ' + (i + 2) + ': unknown slot "' + slot + '"'); return; }
      taken[key] = true;
      rows.push({ id: Store.newId(), groupId: groupId, created: stamp_(r[0] instanceof Date ? r[0] : new Date(), 'created'),
        email: String(r[1]).toLowerCase(), teachers: String(r[2]), grades: String(r[3]), space: space, date: date,
        slot: slot, description: String(r[7]).trim(), status: 'active', token: token, source: 'import', cancelledAt: '' });
    });
  });
  // These rows already exist in Form Responses 2, so don't copy them there again.
  // (Later edits and cancellations made in the new admin page will still update them.)
  Store._noMirror = true;
  try { if (rows.length) Store.appendBookings(rows); } finally { Store._noMirror = false; }
  Logger.log('Imported %s slot bookings.', rows.length);
  if (skipped.length) Logger.log('Skipped:\n' + skipped.join('\n'));
}

// ---------------------------------------------------------------- Form Responses 2 mirror

/**
 * Keeps one row per booking-and-date in Form Responses 2, in the old Form's
 * format: Timestamp, Email, Name, Grade(s), I would like to book:, Booking Date,
 * Period(s), Activity Description. Rows are matched by timestamp + email + date.
 * Cancelling every time on a date removes that row.
 */
function mirrorToForm_(changed) {
  if (!FORM_MIRROR_SHEET || !changed || !changed.length) return;
  try {
    var sh = Store.ss().getSheetByName(FORM_MIRROR_SHEET);
    if (!sh) return;
    var tz = tz_(), settings = Store.getSettings();
    var groups = {};
    changed.forEach(function (b) { groups[b.groupId] = true; });

    // Current state of every touched group, bucketed by date.
    var buckets = {};
    Store.getBookings().forEach(function (b) {
      if (!groups[b.groupId]) return;
      var key = mirrorKey_(b.created, b.email, b.date);
      if (!buckets[key]) buckets[key] = { sample: b, active: [] };
      if (b.status === 'active') buckets[key].active.push(b);
    });

    // Find existing mirror rows.
    var last = sh.getLastRow(), rowsByKey = {};
    if (last > 1) {
      sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r, i) {
        if (!(r[0] instanceof Date)) return;
        rowsByKey[mirrorKey_(stamp_(r[0], 'created'), r[1], dateStr_(r[5]))] = i + 2;
      });
    }

    var toDelete = [];
    Object.keys(buckets).forEach(function (key) {
      var bk = buckets[key], b = bk.sample, row = rowsByKey[key];
      if (!bk.active.length) { if (row) toDelete.push(row); return; }
      var first = bk.active[0];
      var periods = bk.active.map(function (x) { return x.slot; })
        .sort(function (a, c) { return Core.slotIndex(settings, a) - Core.slotIndex(settings, c); }).join(', ');
      var space = settings.spaces.length > 1 ? first.space : '';
      var values = [first.teachers, first.grades, space, Utilities.parseDate(b.date, tz, 'yyyy-MM-dd'), periods, first.description];
      if (row) sh.getRange(row, 3, 1, 6).setValues([values]);
      else sh.appendRow([Utilities.parseDate(b.created, tz, 'yyyy-MM-dd HH:mm:ss'), b.email].concat(values));
    });
    toDelete.sort(function (a, c) { return c - a; }).forEach(function (r) { sh.deleteRow(r); });
  } catch (e) {
    console.error('Form Responses mirror failed: ' + e.message); // never block a booking over this
  }
}

function mirrorKey_(created, email, date) {
  return String(created).slice(0, 19) + '|' + String(email || '').trim().toLowerCase() + '|' + date;
}

/**
 * Run once after turning on Google sign-in: grants permission to check sign-ins
 * with Google and confirms GOOGLE_CLIENT_ID is filled in.
 */
function testSignInSetup() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Paste your OAuth Client ID into GOOGLE_CLIENT_ID at the top of BookingApi.gs first.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=test', { muteHttpExceptions: true });
  Logger.log('Google sign-in check is reachable (status %s). Sign-in is ON for client %s.', res.getResponseCode(), GOOGLE_CLIENT_ID);
}

/** Run this once from the editor to grant email permission and send yourself a test. */
function testEmail() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Library booking email test', 'Email sending works.');
}
