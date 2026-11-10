/* Winchester P.S. Library Booking — librarian admin page */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SS_KEY = 'wps-library-admin';
  var st = { pass: '', settings: null, calendar: [], statics: [], librarian: {}, bookings: [], checked: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast'); t.textContent = msg; t.classList.toggle('is-error', !!isError); t.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, isError ? 6000 : 3000);
  }
  function call(action, payload) { return Api.call(action, Object.assign({ passcode: st.pass }, payload || {})); }
  function busy(btn, on, text) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Saving…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function lines(v) { return v.split(/\n|,/).map(function (x) { return x.trim(); }).filter(Boolean); }

  // ------------------------------------------------------------ Sign in

  function login(pass) {
    $('loginError').hidden = true;
    busy($('loginBtn'), true, 'Signing in…');
    st.pass = pass;
    return Api.call('adminLogin', { passcode: pass }).then(function (r) {
      st.settings = r.settings;
      try { sessionStorage.setItem(SS_KEY, pass); } catch (e) { }
      return Api.call('init');
    }).then(function (init) {
      st.calendar = init.calendar; st.statics = init.statics; st.librarian = init.librarian;
      $('loginView').hidden = true; $('adminView').hidden = false; $('logoutBtn').hidden = false;
      document.querySelectorAll('[data-bind]').forEach(function (el) { el.textContent = st.settings[el.getAttribute('data-bind')] || el.textContent; });
      if (st.pass === 'changeme') toast('You’re using the starting passcode. Change it under Settings.', true);
      $('fFrom').value = today(); $('fTo').value = Core.addDays(today(), 30);
      fillSettings(); renderStatics(); renderCalendar(); renderLibrarian();
      loadBookings();
    }).catch(function (e) {
      try { sessionStorage.removeItem(SS_KEY); } catch (x) { }
      $('loginError').textContent = e.message; $('loginError').hidden = false;
    }).then(function () { busy($('loginBtn'), false); });
  }

  // ------------------------------------------------------------ Bookings

  function loadBookings() {
    var tb = document.querySelector('#bookingTable tbody');
    tb.innerHTML = '<tr><td colspan="8" class="muted">Loading…</td></tr>';
    call('adminBookings', { from: $('fFrom').value, to: $('fTo').value, includeCancelled: $('fCancelled').checked }).then(function (r) {
      st.bookings = r.bookings; st.checked = {}; renderBookings();
    }).catch(function (e) { tb.innerHTML = ''; toast(e.message, true); });
  }

  function renderBookings() {
    var s = st.settings, q = $('fSearch').value.trim().toLowerCase();
    var list = st.bookings.filter(function (b) {
      return !q || [b.teachers, b.grades, b.description, b.email, b.slot].join(' ').toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : Core.slotIndex(s, a.slot) - Core.slotIndex(s, b.slot);
    });
    var prev = '', multi = s.spaces.length > 1;
    document.querySelector('#bookingTable tbody').innerHTML = list.map(function (b) {
      var first = b.date !== prev; prev = b.date;
      var off = b.status !== 'active';
      return '<tr class="' + (first ? 'day-start ' : '') + (off ? 'is-cancelled' : '') + '">' +
        '<td class="col-check">' + (off ? '' : '<input type="checkbox" data-check="' + esc(b.id) + '" aria-label="Select">') + '</td>' +
        '<td class="nowrap c-date' + (first ? '' : ' rep') + '"><b>' + Core.fmtDateLong(b.date) + '</b></td>' +
        '<td class="nowrap c-slot">' + esc(b.slot) + (multi ? '<span class="src">' + esc(b.space) + '</span>' : '') + '</td>' +
        '<td class="c-who">' + esc(b.teachers) + '</td><td class="c-gr">' + esc(b.grades) + '</td><td class="c-desc">' + esc(b.description) + '</td>' +
        '<td class="c-by">' + esc(b.email || '—') + '<span class="src">' + esc(b.source) + ', ' + esc((b.created || '').slice(0, 16)) + '</span></td>' +
        '<td class="actions">' + (off ? '<span class="muted">Cancelled</span>' :
          '<button class="btn btn-quiet btn-small" data-edit="' + esc(b.id) + '" type="button">Edit</button>' +
          '<button class="btn btn-danger btn-small" data-cancel="' + esc(b.id) + '" type="button">Cancel</button>') + '</td></tr>';
    }).join('');
    $('bookingEmpty').hidden = list.length > 0;
    $('checkAll').checked = false;
    updateBulk();
  }

  function updateBulk() {
    var n = Object.keys(st.checked).length;
    $('bulkBar').hidden = !n;
    $('bulkCount').textContent = n + (n === 1 ? ' booking selected' : ' bookings selected');
  }

  function cancelIds(ids, btn) {
    if (btn && !btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm'); btn.dataset.label = btn.textContent; btn.textContent = 'Confirm';
      setTimeout(function () { if (btn.isConnected && !btn.disabled) { btn.classList.remove('is-confirm'); btn.textContent = btn.dataset.label; } }, 4000);
      return;
    }
    if (btn) busy(btn, true, 'Cancelling…');
    call('adminCancel', { ids: ids }).then(function (r) {
      toast(r.cancelled.length === 1 ? 'Booking cancelled' : r.cancelled.length + ' bookings cancelled');
      loadBookings();
    }).catch(function (e) { toast(e.message, true); if (btn) busy(btn, false); });
  }

  // Add / edit dialog
  var editing = null;
  function openAdd() {
    editing = null;
    $('editDialog').classList.remove('is-edit');
    $('editTitle').textContent = 'Add a booking';
    $('eDate').value = today(); $('eTeachers').value = ''; $('eGrades').value = ''; $('eDesc').value = ''; $('eEmail').value = '';
    $('eSpace').innerHTML = st.settings.spaces.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    $('eSpaceWrap').hidden = st.settings.spaces.length < 2;
    $('eSlots').innerHTML = st.settings.slots.map(function (sl) {
      return '<label class="toggle"><input type="checkbox" value="' + esc(sl.name) + '"><span>' + esc(sl.name) + '</span></label>';
    }).join('');
    updateDayInfo();
    $('editError').hidden = true;
    $('editSubmit').textContent = 'Add booking';
    $('editDialog').showModal();
  }
  function updateDayInfo() {
    var d = $('eDate').value;
    if (!Core.isDateStr(d)) { $('eDayInfo').textContent = ''; return; }
    var info = Core.dayInfo(d, st.settings, st.calendar);
    $('eDayInfo').textContent = Core.fmtDateLong(d) + ': ' + (info.closed ? 'no school (' + info.closedLabel + ')' : 'Day ' + info.cycleDay);
  }
  function openEdit(id) {
    var b = st.bookings.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    editing = b;
    $('editDialog').classList.add('is-edit');
    $('editTitle').textContent = 'Edit booking';
    $('eWhen').textContent = b.slot + ', ' + Core.fmtDateLong(b.date) + '. Changes apply to every time in this booking.';
    $('eTeachers').value = b.teachers; $('eGrades').value = b.grades; $('eDesc').value = b.description;
    $('editError').hidden = true;
    $('editSubmit').textContent = 'Save changes';
    $('editDialog').showModal();
  }
  function submitEdit(e) {
    e.preventDefault();
    var btn = $('editSubmit'), req;
    if (editing) {
      req = call('adminUpdate', { groupId: editing.groupId, teachers: $('eTeachers').value, grades: $('eGrades').value, description: $('eDesc').value });
    } else {
      var slots = Array.prototype.map.call(document.querySelectorAll('#eSlots input:checked'), function (i) { return i.value; });
      req = call('adminBook', {
        email: $('eEmail').value, teachers: $('eTeachers').value, grades: $('eGrades').value, description: $('eDesc').value,
        items: slots.map(function (sl) { return { date: $('eDate').value, slot: sl, space: $('eSpace').value || st.settings.spaces[0] }; })
      });
    }
    busy(btn, true);
    req.then(function () {
      $('editDialog').close(); toast(editing ? 'Booking updated' : 'Booking added'); loadBookings();
    }).catch(function (err) {
      $('editError').textContent = err.message; $('editError').hidden = false;
    }).then(function () { busy(btn, false); });
  }

  // ------------------------------------------------------------ Recurring

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function renderStatics() {
    var s = st.settings, len = s.cycleLength || 5;
    $('staticList').innerHTML = st.statics.length ? st.statics.map(function (x, i) {
      var dayOpts = x.repeat === 'weekday'
        ? [1, 2, 3, 4, 5].map(function (d) { return [d, DOW[d]]; })
        : Array.apply(null, Array(len)).map(function (_, k) { return [k + 1, 'Day ' + (k + 1)]; });
      return '<div class="static-card" data-i="' + i + '">' +
        '<div class="row">' +
        '<label>Label<input type="text" data-f="label" value="' + esc(x.label) + '" placeholder="e.g. Dubyk 102 - Book Exchange"></label>' +
        '<label>Repeats<select data-f="repeat">' +
        [['cycle', 'Every cycle day…'], ['weekday', 'Every weekday…'], ['date', 'One date only']].map(function (o) {
          return '<option value="' + o[0] + '"' + (x.repeat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>' +
        '<label>' + (x.repeat === 'date' ? 'Date' : 'From') + '<input type="date" data-f="start" value="' + esc(x.start) + '"></label>' +
        (x.repeat === 'date' ? '<span></span>' : '<label>Until<input type="date" data-f="end" value="' + esc(x.end) + '"></label>') +
        '</div>' +
        (x.repeat === 'date' ? '' : '<div><span class="minilabel">On</span><div class="toggles">' + dayOpts.map(function (d) {
          return '<label class="toggle"><input type="checkbox" data-day="' + d[0] + '"' + (x.days.indexOf(d[0]) >= 0 ? ' checked' : '') + '><span>' + d[1] + '</span></label>';
        }).join('') + '</div></div>') +
        '<div><span class="minilabel">Times</span><div class="toggles">' + s.slots.map(function (sl) {
          return '<label class="toggle"><input type="checkbox" data-slot="' + esc(sl.name) + '"' + (x.slots.indexOf(sl.name) >= 0 ? ' checked' : '') + '><span>' + esc(sl.name) + '</span></label>';
        }).join('') + '</div></div>' +
        '<div class="foot">' +
        (s.spaces.length > 1 ? '<label>Space<select data-f="space"><option value="">All spaces</option>' + s.spaces.map(function (sp) {
          return '<option' + (x.space === sp ? ' selected' : '') + '>' + esc(sp) + '</option>';
        }).join('') + '</select></label>' : '<small>Leave dates blank to repeat all year.</small>') +
        '<button class="btn btn-danger btn-small" type="button" data-remove="' + i + '">Remove</button></div></div>';
    }).join('') : '<p class="empty">No recurring bookings yet.</p>';
  }

  function readStatics() {
    document.querySelectorAll('.static-card').forEach(function (card) {
      var x = st.statics[+card.dataset.i];
      card.querySelectorAll('[data-f]').forEach(function (el) { x[el.dataset.f] = el.value; });
      if (x.repeat !== 'date') x.days = Array.prototype.map.call(card.querySelectorAll('[data-day]:checked'), function (el) { return +el.dataset.day; });
      else { x.days = []; x.end = ''; }
      x.slots = Array.prototype.map.call(card.querySelectorAll('[data-slot]:checked'), function (el) { return el.dataset.slot; });
    });
  }

  // ------------------------------------------------------------ Calendar

  function renderCalendar() {
    var s = st.settings;
    $('sYearStart').value = s.yearStart; $('sYearEnd').value = s.yearEnd; $('sCycleLength').value = s.cycleLength;
    document.querySelector('#calTable tbody').innerHTML = st.calendar.map(function (c, i) {
      return '<tr data-i="' + i + '"><td><input type="date" data-f="start" value="' + esc(c.start) + '"></td>' +
        '<td><input type="date" data-f="end" value="' + esc(c.end) + '"></td>' +
        '<td><input type="text" data-f="label" value="' + esc(c.label) + '"></td>' +
        '<td><select data-f="type"><option' + (c.type === 'Closed' ? ' selected' : '') + '>Closed</option><option' + (c.type !== 'Closed' ? ' selected' : '') + '>Event</option></select></td>' +
        '<td><input type="number" min="1" max="10" data-f="setDay" value="' + esc(c.setDay) + '" style="width:80px"></td>' +
        '<td><button class="btn btn-danger btn-small" type="button" data-remove="' + i + '">Remove</button></td></tr>';
    }).join('');
    updateCycleCheck();
  }

  function readCalendar() {
    document.querySelectorAll('#calTable tbody tr').forEach(function (tr) {
      var c = st.calendar[+tr.dataset.i];
      tr.querySelectorAll('[data-f]').forEach(function (el) { c[el.dataset.f] = el.value; });
    });
  }

  function previewSettings() {
    var s = JSON.parse(JSON.stringify(st.settings));
    s.yearStart = $('sYearStart').value; s.yearEnd = $('sYearEnd').value; s.cycleLength = +$('sCycleLength').value || 5;
    return s;
  }

  function updateCycleCheck() {
    readCalendar();
    var s = previewSettings(), t = today(), memo = {}, out = [], d = t;
    if (!Core.isDateStr(s.yearStart) || !Core.isDateStr(s.yearEnd)) { $('cycleCheck').textContent = ''; return; }
    for (var n = 0; n < 60 && out.length < 6; n++, d = Core.addDays(d, 1)) {
      var info = Core.dayInfo(d, s, st.calendar.filter(function (c) { return Core.isDateStr(c.start); }), memo);
      if (!info.closed) out.push(Core.DAYS[Core.weekday(d)].slice(0, 3) + ' ' + Core.fmtDateShort(d) + ' = Day ' + info.cycleDay);
    }
    $('cycleCheck').textContent = out.length ? 'Check: ' + out.join(', ') : 'No school days in the next 60 days.';
  }

  // ------------------------------------------------------------ Librarian

  function renderLibrarian() {
    var s = st.settings, len = s.cycleLength || 5;
    $('sShowLibrarian').checked = !!s.showLibrarian; $('sLibrarianLabel').value = s.librarianLabel || '';
    var head = '<tr><th>Time</th>';
    for (var i = 1; i <= len; i++) head += '<th>Day ' + i + '</th>';
    document.querySelector('#libTable thead').innerHTML = head + '</tr>';
    document.querySelector('#libTable tbody').innerHTML = s.slots.map(function (sl) {
      var row = st.librarian[sl.name] || [], h = '<tr><td class="nowrap"><b>' + esc(sl.name) + '</b></td>';
      for (var i = 0; i < len; i++) h += '<td><input type="text" data-slot="' + esc(sl.name) + '" data-d="' + i + '" value="' + esc(row[i] || '') + '"></td>';
      return h + '</tr>';
    }).join('');
  }

  // ------------------------------------------------------------ Settings

  function fillSettings() {
    var s = st.settings;
    $('sBookingsOpen').checked = !!s.bookingsOpen; $('sClosedMessage').value = s.closedMessage || '';
    $('sWindowDays').value = s.windowDays; $('sMinNotice').value = s.minNoticeMinutes;
    $('sMaxPerBooking').value = s.maxSlotsPerBooking; $('sMaxPerWeek').value = s.maxSlotsPerWeek;
    $('sAllowCancel').checked = !!s.allowTeacherCancel;
    $('sSpaces').value = s.spaces.join('\n');
    $('sTeachers').value = s.teachers.join('\n'); $('sGrades').value = s.grades.join('\n');
    $('sAllowOther').checked = !!s.allowOtherTeacher; $('sEmailDomain').value = s.emailDomain || '';
    $('sSendConfirm').checked = !!s.sendConfirmation; $('sNotifyEmail').value = s.notifyEmail || '';
    $('sSchoolName').value = s.schoolName; $('sSiteTitle').value = s.siteTitle;
    $('sAnnouncement').value = s.announcement || ''; $('sSiteUrl').value = s.siteUrl || '';
    renderSlots();
  }

  function renderSlots() {
    var n = st.settings.slots.length;
    document.querySelector('#slotTable tbody').innerHTML = st.settings.slots.map(function (sl, i) {
      return '<tr data-i="' + i + '"><td><input type="text" data-f="name" value="' + esc(sl.name) + '"></td>' +
        '<td><input type="time" data-f="start" value="' + esc(sl.start) + '"></td>' +
        '<td><input type="time" data-f="end" value="' + esc(sl.end) + '"></td>' +
        '<td><input type="checkbox" data-f="bookable"' + (sl.bookable ? ' checked' : '') + ' aria-label="Bookable"></td>' +
        '<td class="actions"><button class="btn btn-quiet btn-small" type="button" data-move="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
        '<button class="btn btn-quiet btn-small" type="button" data-move="' + i + '" data-dir="1"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-remove="' + i + '">Remove</button></td></tr>';
    }).join('');
  }

  function readSlots() {
    document.querySelectorAll('#slotTable tbody tr').forEach(function (tr) {
      var sl = st.settings.slots[+tr.dataset.i];
      tr.querySelectorAll('[data-f]').forEach(function (el) { sl[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
    });
  }

  function saveSettings(patch, btn, msg) {
    if (btn) busy(btn, true);
    return call('adminSaveSettings', { settings: patch }).then(function (r) {
      st.settings = r.settings; toast(msg || 'Settings saved');
      fillSettings(); renderStatics(); renderLibrarian();
    }).catch(function (e) { toast(e.message, true); throw e; }).then(function () { if (btn) busy(btn, false); }, function () { if (btn) busy(btn, false); });
  }

  // ------------------------------------------------------------ Wire up

  function bind() {
    if (Api.demo) { $('demoNotice').hidden = false; }
    $('resetDemo').onclick = function () { Api.resetDemo(); location.reload(); };
    $('loginForm').addEventListener('submit', function (e) { e.preventDefault(); login($('passcode').value); });
    $('logoutBtn').onclick = function () { try { sessionStorage.removeItem(SS_KEY); } catch (e) { } location.reload(); };

    document.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      document.querySelectorAll('.tabs [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab; });
    });

    // Bookings
    ['fFrom', 'fTo', 'fCancelled'].forEach(function (id) { $(id).addEventListener('change', loadBookings); });
    $('fSearch').addEventListener('input', renderBookings);
    $('addBookingBtn').onclick = openAdd;
    $('eDate').addEventListener('change', updateDayInfo);
    $('editForm').addEventListener('submit', submitEdit);
    $('bookingTable').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cancel]'); if (c) return cancelIds([c.dataset.cancel], c);
      var ed = e.target.closest('[data-edit]'); if (ed) return openEdit(ed.dataset.edit);
    });
    $('bookingTable').addEventListener('change', function (e) {
      if (e.target.id === 'checkAll') {
        document.querySelectorAll('[data-check]').forEach(function (cb) { cb.checked = e.target.checked; if (cb.checked) st.checked[cb.dataset.check] = true; else delete st.checked[cb.dataset.check]; });
      } else if (e.target.dataset.check) {
        if (e.target.checked) st.checked[e.target.dataset.check] = true; else delete st.checked[e.target.dataset.check];
      }
      updateBulk();
    });
    $('bulkCancel').onclick = function () { cancelIds(Object.keys(st.checked), this); };

    // Recurring
    $('addStatic').onclick = function () {
      readStatics();
      st.statics.push({ id: '', repeat: 'cycle', days: [], slots: [], space: '', label: '', start: '', end: '' });
      renderStatics();
      var cards = document.querySelectorAll('.static-card'); cards[cards.length - 1].querySelector('input').focus();
    };
    $('staticList').addEventListener('click', function (e) {
      var r = e.target.closest('[data-remove]'); if (!r) return;
      readStatics(); st.statics.splice(+r.dataset.remove, 1); renderStatics();
    });
    $('staticList').addEventListener('change', function (e) {
      if (e.target.dataset.f === 'repeat') { readStatics(); var x = st.statics[+e.target.closest('.static-card').dataset.i]; x.days = []; renderStatics(); }
    });
    $('saveStatics').onclick = function () {
      readStatics();
      var bad = st.statics.filter(function (x) { return !x.label || !x.slots.length || (x.repeat === 'date' ? !x.start : !x.days.length); });
      if (bad.length) return toast('Each recurring booking needs a label, at least one time, and a day or date.', true);
      var btn = this; busy(btn, true);
      call('adminSaveStatics', { statics: st.statics }).then(function (r) { st.statics = r.statics; renderStatics(); toast('Recurring bookings saved'); })
        .catch(function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    };

    // Calendar
    $('addCal').onclick = function () {
      readCalendar(); st.calendar.push({ start: today(), end: today(), label: '', type: 'Closed', setDay: '' }); renderCalendar();
      var rows = document.querySelectorAll('#calTable tbody tr'); rows[rows.length - 1].querySelector('[data-f=label]').focus();
    };
    $('calTable').addEventListener('click', function (e) {
      var r = e.target.closest('[data-remove]'); if (!r) return;
      readCalendar(); st.calendar.splice(+r.dataset.remove, 1); renderCalendar();
    });
    $('calTable').addEventListener('change', updateCycleCheck);
    ['sYearStart', 'sYearEnd', 'sCycleLength'].forEach(function (id) { $(id).addEventListener('change', updateCycleCheck); });
    $('saveCal').onclick = function () {
      readCalendar();
      var btn = this; busy(btn, true);
      call('adminSaveCalendar', { calendar: st.calendar }).then(function (r) {
        st.calendar = r.calendar;
        return call('adminSaveSettings', { settings: { yearStart: $('sYearStart').value, yearEnd: $('sYearEnd').value, cycleLength: $('sCycleLength').value } });
      }).then(function (r) { st.settings = r.settings; renderCalendar(); renderStatics(); renderLibrarian(); toast('Calendar saved'); })
        .catch(function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    };

    // Librarian
    $('saveLib').onclick = function () {
      var grid = {};
      document.querySelectorAll('#libTable [data-slot]').forEach(function (el) { (grid[el.dataset.slot] = grid[el.dataset.slot] || [])[+el.dataset.d] = el.value.trim(); });
      var btn = this; busy(btn, true);
      call('adminSaveLibrarian', { librarian: grid }).then(function (r) {
        st.librarian = r.librarian;
        return call('adminSaveSettings', { settings: { showLibrarian: $('sShowLibrarian').checked, librarianLabel: $('sLibrarianLabel').value.trim() } });
      }).then(function (r) { st.settings = r.settings; toast('Librarian schedule saved'); })
        .catch(function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    };

    // Settings
    $('addSlot').onclick = function () { readSlots(); st.settings.slots.push({ name: '', start: '15:15', end: '16:00', bookable: true }); renderSlots(); };
    $('slotTable').addEventListener('click', function (e) {
      var r = e.target.closest('[data-remove]'), m = e.target.closest('[data-move]');
      if (!r && !m) return;
      readSlots();
      var a = st.settings.slots;
      if (r) a.splice(+r.dataset.remove, 1);
      else { var i = +m.dataset.move, j = i + +m.dataset.dir; var t = a[i]; a[i] = a[j]; a[j] = t; }
      renderSlots();
    });
    $('saveSettings').onclick = function () {
      readSlots();
      var patch = {
        bookingsOpen: $('sBookingsOpen').checked, closedMessage: $('sClosedMessage').value.trim(),
        windowDays: $('sWindowDays').value, minNoticeMinutes: $('sMinNotice').value,
        maxSlotsPerBooking: $('sMaxPerBooking').value, maxSlotsPerWeek: $('sMaxPerWeek').value,
        allowTeacherCancel: $('sAllowCancel').checked, slots: st.settings.slots,
        spaces: lines($('sSpaces').value), teachers: lines($('sTeachers').value), grades: lines($('sGrades').value),
        allowOtherTeacher: $('sAllowOther').checked, emailDomain: $('sEmailDomain').value.trim(),
        sendConfirmation: $('sSendConfirm').checked, notifyEmail: $('sNotifyEmail').value.trim(),
        schoolName: $('sSchoolName').value.trim(), siteTitle: $('sSiteTitle').value.trim(),
        announcement: $('sAnnouncement').value.trim(), siteUrl: $('sSiteUrl').value.trim().replace(/\/$/, '')
      };
      if (patch.slots.some(function (sl) { return !sl.name.trim(); })) return toast('Every time slot needs a name.', true);
      saveSettings(patch, this);
    };
    $('savePass').onclick = function () {
      var v = $('newPass').value, btn = this;
      if (v.length < 6) return toast('Use at least 6 characters for the passcode.', true);
      busy(btn, true);
      call('adminSetPasscode', { newPasscode: v }).then(function () {
        st.pass = v; try { sessionStorage.setItem(SS_KEY, v); } catch (e) { }
        $('newPass').value = ''; toast('Passcode changed');
      }).catch(function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    };

    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) d.close(); });
    });
  }

  bind();
  var saved = null;
  try { saved = sessionStorage.getItem(SS_KEY); } catch (e) { }
  if (saved) { $('passcode').value = saved; login(saved); }
  else $('passcode').focus();
})();
