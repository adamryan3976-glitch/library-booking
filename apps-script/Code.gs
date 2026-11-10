/**
 * Winchester P.S. Library Booking — Google Apps Script backend.
 *
 * Lives inside the existing "Winchester Library Booking" Google Sheet
 * (Extensions → Apps Script). Stores everything in tabs that start with "App ".
 * Booking rules are in Core.gs (shared with the website).
 *
 * First-time setup: run setup() once from the editor, then deploy as a Web app.
 * See README.md in the GitHub repo for the full steps.
 */

var SHEETS = {
  bookings: 'App Bookings',
  statics: 'App Static Bookings',
  calendar: 'App Calendar',
  librarian: 'App Librarian Schedule',
  settings: 'App Settings'
};

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

function respond(action, payload) {
  var out;
  try {
    if (String(action).indexOf('admin') === 0) throttleAdmin_(payload);
    out = { ok: true, data: Core.handle(action, payload, Store, now_()) };
  } catch (e) {
    out = { ok: false, error: e.userFacing ? e.message : 'Something went wrong on the server: ' + e.message };
    if (!e.userFacing) console.error(e);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function now_() {
  var tz = Session.getScriptTimeZone() || 'America/Toronto';
  var d = new Date();
  return {
    date: Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
    minutes: +Utilities.formatDate(d, tz, 'H') * 60 + +Utilities.formatDate(d, tz, 'm'),
    stamp: Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss')
  };
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
  ss: function () { return SpreadsheetApp.getActiveSpreadsheet(); },
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
  },
  updateBookings: function (rows) {
    var sh = this.sheet(SHEETS.bookings);
    rows.forEach(function (b) {
      sh.getRange(b._row, 1, 1, BOOKING_COLS.length)
        .setValues([BOOKING_COLS.map(function (k) { return b[k] == null ? '' : b[k]; })]);
    });
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
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).trim();
}
function stamp_(d, key) {
  var tz = Session.getScriptTimeZone();
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('America/Toronto');

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
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form Responses 2');
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
      rows.push({ id: Store.newId(), groupId: groupId, created: stamp_(r[0] instanceof Date ? r[0] : new Date()),
        email: String(r[1]).toLowerCase(), teachers: String(r[2]), grades: String(r[3]), space: space, date: date,
        slot: slot, description: String(r[7]).trim(), status: 'active', token: token, source: 'import', cancelledAt: '' });
    });
  });
  if (rows.length) Store.appendBookings(rows);
  Logger.log('Imported %s slot bookings.', rows.length);
  if (skipped.length) Logger.log('Skipped:\n' + skipped.join('\n'));
}

/** Run this once from the editor to grant email permission and send yourself a test. */
function testEmail() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Library booking email test', 'Email sending works.');
}
