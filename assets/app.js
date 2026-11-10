/* Winchester P.S. Library Booking — teacher page */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LS_PROFILE = 'wps-library-profile', LS_GROUPS = 'wps-library-groups';

  var state = {
    cfg: null, weekStart: null, cache: {}, loadedAt: {}, selected: {}, dayIndex: 0,
    profile: load(LS_PROFILE, { teachers: [], email: '', grades: [] }),
    groups: load(LS_GROUPS, []),
    draftTeachers: [], loadToken: 0
  };

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function torontoNow() {
    var parts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + '-' + parts.month + '-' + parts.day, minutes: (+parts.hour % 24) * 60 + +parts.minute };
  }

  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg; t.classList.toggle('is-error', !!isError); t.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, isError ? 6000 : 3500);
  }

  function isMobile() { return window.matchMedia('(max-width: 899px)').matches; }

  // ------------------------------------------------------------ Start-up

  function start() {
    if (Api.demo) $('demoNotice').hidden = false;
    Api.call('init').then(function (cfg) {
      state.cfg = cfg;
      applySettings();
      var params = new URLSearchParams(location.search);
      var startDate = params.get('date');
      state.weekStart = Core.mondayOf(Core.isDateStr(startDate) ? startDate : torontoNow().date);
      pickDefaultDay();
      loadWeek();
      if (params.get('booking') && params.get('token')) {
        addGroup(params.get('booking'), params.get('token'));
        history.replaceState(null, '', location.pathname);
        openMine();
      }
    }).catch(function (e) {
      $('loading').textContent = e.message;
      $('gridWrap').classList.add('is-loading');
    });
    bind();
  }

  function applySettings() {
    var s = state.cfg.settings;
    document.querySelectorAll('[data-bind]').forEach(function (el) { el.textContent = s[el.getAttribute('data-bind')] || el.textContent; });
    document.title = s.siteTitle + ' – ' + s.schoolName;
    if (s.announcement) { $('announcement').textContent = s.announcement; $('announcement').hidden = false; }
    if (!s.bookingsOpen) { $('closedNotice').textContent = s.closedMessage; $('closedNotice').hidden = false; }
    if (s.showLibrarian) { $('librarianNote').textContent = '“' + s.librarianLabel + '” notes show when the librarian is away from the library.'; $('librarianNote').hidden = false; }
    $('email').placeholder = 'name@' + (s.emailDomain || 'school.ca');
    $('teacherList').innerHTML = s.teachers.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('');
    $('teacherInput').placeholder = s.allowOtherTeacher ? 'Start typing a name' : 'Choose from the staff list';
    $('gradeToggles').innerHTML = s.grades.map(function (g) {
      return '<label class="toggle"><input type="checkbox" name="grade" value="' + esc(g) + '"><span>' + esc(g) + '</span></label>';
    }).join('');
  }

  function pickDefaultDay() {
    var today = torontoNow().date, memo = {};
    var idx = -1;
    for (var i = 0; i < 5; i++) {
      var d = Core.addDays(state.weekStart, i);
      var info = Core.dayInfo(d, state.cfg.settings, state.cfg.calendar, memo);
      if (d === today) { idx = i; break; }
      if (idx < 0 && !info.closed && d >= today) idx = i;
    }
    state.dayIndex = idx < 0 ? 0 : idx;
  }

  // ------------------------------------------------------------ Data

  function loadWeek(force) {
    var wk = state.weekStart;
    var token = ++state.loadToken;
    render();
    if (state.cache[wk] && !force) { prefetch(Core.addDays(wk, 7)); return Promise.resolve(); }
    $('gridWrap').classList.add('is-loading');
    return fetchWeek(wk).then(function () {
      if (token !== state.loadToken) return;
      $('gridWrap').classList.remove('is-loading');
      render();
      prefetch(Core.addDays(wk, 7));
    }).catch(function (e) {
      if (token !== state.loadToken) return;
      $('gridWrap').classList.remove('is-loading');
      toast(e.message, true);
    });
  }

  function fetchWeek(wk) {
    return Api.call('bookings', { from: wk, to: Core.addDays(wk, 4) }).then(function (r) {
      state.cache[wk] = r.bookings; state.loadedAt[wk] = Date.now();
    });
  }

  function prefetch(wk) { if (!state.cache[wk]) fetchWeek(wk).catch(function () { }); }

  function myGroupIds() { var o = {}; state.groups.forEach(function (g) { o[g.groupId] = true; }); return o; }

  function addGroup(groupId, token) {
    if (!state.groups.some(function (g) { return g.groupId === groupId; })) {
      state.groups.push({ groupId: groupId, token: token }); save(LS_GROUPS, state.groups);
    }
  }

  // ------------------------------------------------------------ Rendering

  function weekLabel(wk) {
    var fri = Core.addDays(wk, 4);
    var a = Core.fmtDateShort(wk), b = Core.fmtDateShort(fri);
    var sameMonth = a.split(' ')[0] === b.split(' ')[0];
    return a + ' – ' + (sameMonth ? b.split(' ')[1] : b);
  }

  function weekSub(wk) {
    var cur = Core.mondayOf(torontoNow().date);
    var diff = Math.round((Date.parse(wk) - Date.parse(cur)) / (7 * 864e5));
    if (diff === 0) return 'This week';
    if (diff === 1) return 'Next week';
    if (diff === -1) return 'Last week';
    return diff > 0 ? 'In ' + diff + ' weeks' : Math.abs(diff) + ' weeks ago';
  }

  function slotState(date, slot, space, info, ctx) {
    var key = date + '|' + slot.name + '|' + space;
    var b = ctx.byKey[key];
    if (b) return { kind: 'booked', booking: b };
    var st = ctx.statics.filter(function (x) { return x.slots.indexOf(slot.name) >= 0 && (!x.space || x.space === space); });
    if (st.length) return { kind: 'reserved', label: st[0].label };
    var s = state.cfg.settings;
    if (!slot.bookable) return { kind: 'off', text: 'Not bookable' };
    if (!s.bookingsOpen) return { kind: 'off', text: '' };
    if (date < ctx.now.date || (date === ctx.now.date && Core.toMinutes(slot.start) - (s.minNoticeMinutes || 0) <= ctx.now.minutes))
      return { kind: 'off', text: '' };
    if (date > ctx.lastDay) return { kind: 'off', text: 'Opens ' + Core.fmtDateShort(Core.addDays(date, -s.windowDays)) };
    return { kind: 'open', key: key };
  }

  function render() {
    if (!state.cfg) return;
    var s = state.cfg.settings, cfg = state.cfg;
    var wk = state.weekStart, now = torontoNow(), memo = {};
    var bookings = state.cache[wk] || [];
    var byKey = {};
    bookings.forEach(function (b) { byKey[b.date + '|' + b.slot + '|' + b.space] = b; });
    var mine = myGroupIds();
    var lastDay = Core.addDays(now.date, s.windowDays || 0);
    var multiSpace = s.spaces.length > 1;

    $('weekLabel').textContent = weekLabel(wk);
    $('weekSub').textContent = weekSub(wk);
    $('jumpDate').value = wk;
    document.querySelector('.weekbar').classList.toggle('not-current', wk !== Core.mondayOf(now.date));

    var html = ['<div class="g-corner"></div>'];
    var tabs = [];
    var days = [0, 1, 2, 3, 4].map(function (i) { return Core.addDays(wk, i); });
    var infos = days.map(function (d) { return Core.dayInfo(d, s, cfg.calendar, memo); });

    days.forEach(function (d, i) {
      var info = infos[i], shown = i === state.dayIndex ? ' is-shown' : '';
      var dt = new Date(d + 'T12:00:00');
      var dayName = Core.DAYS[Core.weekday(d)];
      var hasBooking = bookings.some(function (b) { return b.date === d; });
      html.push('<div class="g-day' + (d === now.date ? ' is-today' : '') + shown + '" style="--c:' + (i + 2) + '" role="columnheader">' +
        '<span class="g-day-name">' + dayName + '</span>' +
        '<span class="cycle' + (info.closed ? ' is-off' : '') + '" aria-label="' + (info.closed ? 'No school' : 'Cycle day ' + info.cycleDay) + '">' +
        (info.closed ? '<b>Off</b>' : '<small>Day</small><b>' + info.cycleDay + '</b>') + '</span>' +
        '<span class="g-day-date">' + Core.fmtDateShort(d) + '</span>' +
        (info.events.length ? '<span class="g-day-events">' + info.events.map(function (e) { return '<span>' + esc(e) + '</span>'; }).join('') + '</span>' : '') +
        '</div>');
      tabs.push('<button type="button" role="tab" class="daytab' + (info.closed ? ' is-off' : '') + '" data-day="' + i + '" aria-selected="' + (i === state.dayIndex) + '">' +
        '<b>' + dayName.slice(0, 3) + '</b><span>' + dt.getDate() + '</span>' +
        '<em>' + (info.closed ? 'Off' : 'Day ' + info.cycleDay) + (hasBooking ? '<i class="dot" aria-hidden="true"></i>' : '') + '</em></button>');
    });

    s.slots.forEach(function (slot, r) {
      var short = Core.toMinutes(slot.end) - Core.toMinutes(slot.start) <= 15 ? ' is-short' : '';
      html.push('<div class="g-time' + short + '" style="--r:' + (r + 2) + '" role="rowheader"><b>' + esc(slot.name) + '</b><span>' +
        Core.fmtTime(slot.start) + '–' + Core.fmtTime(slot.end) + '</span></div>');
    });

    days.forEach(function (d, i) {
      var info = infos[i], shown = i === state.dayIndex ? ' is-shown' : '';
      if (info.closed) {
        html.push('<div class="g-closed' + shown + '" style="--c:' + (i + 2) + ';--span:' + s.slots.length + '"><span>' +
          esc(info.closedLabel || 'No school') + '</span></div>');
        return;
      }
      var ctx = { byKey: byKey, statics: Core.staticsFor(d, info.cycleDay, cfg.statics), now: now, lastDay: lastDay };
      s.slots.forEach(function (slot, r) {
        var short = Core.toMinutes(slot.end) - Core.toMinutes(slot.start) <= 15 ? ' is-short' : '';
        var cell = '<div class="g-cell' + short + shown + '" style="--c:' + (i + 2) + ';--r:' + (r + 2) + '" role="gridcell">';
        s.spaces.forEach(function (space) {
          var st = slotState(d, slot, space, info, ctx);
          var spaceTag = multiSpace ? '<span class="slot-space">' + esc(space) + '</span>' : '';
          if (st.kind === 'booked') {
            var b = st.booking, isMine = mine[b.groupId];
            cell += '<div class="slot slot-booked' + (isMine ? ' is-mine' : '') + '" title="' + esc(b.label) + '">' + spaceTag +
              '<span class="who">' + esc(b.teachers) + (b.grades ? ' <span class="what">(' + esc(b.grades) + ')</span>' : '') + '</span>' +
              '<span class="what">' + esc(b.description) + '</span></div>';
          } else if (st.kind === 'reserved') {
            cell += '<div class="slot slot-reserved">' + spaceTag + '<span class="who">' + esc(st.label) + '</span></div>';
          } else if (st.kind === 'open') {
            var picked = !!state.selected[st.key];
            cell += '<button type="button" class="slot slot-open' + (picked ? ' is-picked' : '') + '" data-key="' + esc(st.key) + '" aria-pressed="' + picked + '" ' +
              'aria-label="' + esc(slot.name + ', ' + Core.fmtDateLong(d) + (multiSpace ? ', ' + space : '') + (picked ? ', selected' : ', open')) + '">' +
              spaceTag + '<span class="slot-state">' + (picked ? 'Selected' : 'Open') + '</span></button>';
          } else {
            cell += '<div class="slot-off">' + spaceTag + esc(st.text || '') + '</div>';
          }
        });
        if (s.showLibrarian && cfg.librarian[slot.name]) {
          var where = (cfg.librarian[slot.name] || [])[info.cycleDay - 1];
          // Only call out the librarian when they're somewhere other than the library itself.
          if (where && where.trim().toLowerCase() !== 'library') cell += '<div class="where">' + esc(s.librarianLabel) + ' ' + esc(where) + '</div>';
        }
        html.push(cell + '</div>');
      });
    });

    $('grid').innerHTML = html.join('');
    $('grid').setAttribute('aria-busy', state.cache[wk] ? 'false' : 'true');
    $('dayTabs').innerHTML = tabs.join('');
    renderTray();
  }

  function selectedItems() {
    var s = state.cfg.settings;
    return Object.keys(state.selected).map(function (k) { return state.selected[k]; }).sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : Core.slotIndex(s, a.slot) - Core.slotIndex(s, b.slot);
    });
  }

  function groupedSummary(items) {
    var byDate = {};
    items.forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it.slot); });
    return Object.keys(byDate).map(function (d) {
      return Core.DAYS[Core.weekday(d)].slice(0, 3) + ' ' + Core.fmtDateShort(d) + ': ' + byDate[d].join(', ');
    }).join('; ');
  }

  function renderTray() {
    var items = selectedItems();
    $('tray').hidden = !items.length;
    if (!items.length) return;
    $('trayCount').textContent = items.length + (items.length === 1 ? ' time selected' : ' times selected');
    $('traySummary').textContent = groupedSummary(items);
  }

  // ------------------------------------------------------------ Booking form

  function openBooking() {
    var items = selectedItems();
    if (!items.length) return;
    var p = state.profile;
    state.draftTeachers = (p.teachers || []).slice();
    renderTeacherChips();
    document.querySelectorAll('#gradeToggles input').forEach(function (i) { i.checked = (p.grades || []).indexOf(i.value) >= 0; });
    var known = state.cfg.settings.grades;
    $('gradeOther').value = (p.grades || []).filter(function (g) { return known.indexOf(g) < 0; }).join(', ');
    $('email').value = p.email || '';
    $('bookError').hidden = true;
    renderPicked();
    $('bookDialog').showModal();
    setTimeout(function () { (state.draftTeachers.length ? $('desc') : $('teacherInput')).focus(); }, 50);
  }

  function renderPicked() {
    var items = selectedItems();
    var multiSpace = state.cfg.settings.spaces.length > 1;
    $('pickedList').innerHTML = items.map(function (it) {
      var sl = state.cfg.settings.slots[Core.slotIndex(state.cfg.settings, it.slot)] || {};
      return '<li><span><b>' + esc(it.slot) + '</b> <small>' + Core.fmtTime(sl.start) + '–' + Core.fmtTime(sl.end) + '</small><br>' +
        Core.fmtDateLong(it.date) + (multiSpace ? ', ' + esc(it.space) : '') + '</span>' +
        '<button type="button" class="x" data-unpick="' + esc(it.date + '|' + it.slot + '|' + it.space) + '" aria-label="Remove ' + esc(it.slot) + '">×</button></li>';
    }).join('');
    var n = items.length;
    $('bookSubmit').textContent = n === 1 ? 'Book 1 time' : 'Book ' + n + ' times';
    if (!n) $('bookDialog').close();
  }

  function renderTeacherChips() {
    $('teacherChips').innerHTML = state.draftTeachers.map(function (t, i) {
      return '<button type="button" class="chip" data-chip="' + i + '" aria-label="Remove ' + esc(t) + '">' + esc(t) + '<span aria-hidden="true">×</span></button>';
    }).join('');
  }

  function addTeacher(force) {
    var v = $('teacherInput').value.trim();
    if (!v) return false;
    var list = state.cfg.settings.teachers;
    var match = list.filter(function (t) { return t.toLowerCase() === v.toLowerCase(); })[0];
    if (!match && !force) return false;
    if (!match && !state.cfg.settings.allowOtherTeacher) { showFormError('Choose a name from the staff list.'); return false; }
    var name = match || v;
    if (state.draftTeachers.indexOf(name) < 0) state.draftTeachers.push(name);
    $('teacherInput').value = '';
    renderTeacherChips();
    return true;
  }

  function showFormError(msg) { var el = $('bookError'); el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  function submitBooking(e) {
    e.preventDefault();
    if ($('teacherInput').value.trim()) addTeacher(true);
    var grades = Array.prototype.map.call(document.querySelectorAll('#gradeToggles input:checked'), function (i) { return i.value; })
      .concat($('gradeOther').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean));
    var payload = {
      email: $('email').value.trim(), teachers: state.draftTeachers.slice(), grades: grades,
      description: $('desc').value.trim(), items: selectedItems()
    };
    if (!payload.teachers.length) return showFormError('Add at least one teacher.');
    if (!payload.description) return showFormError('Add a short description of what you’re doing.');
    if (!payload.email) return showFormError('Enter your school email so you get a confirmation.');
    $('bookError').hidden = true;
    var btn = $('bookSubmit'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Booking…';
    Api.call('book', payload).then(function (r) {
      addGroup(r.groupId, r.token);
      if ($('remember').checked) {
        state.profile = { teachers: payload.teachers, email: payload.email, grades: grades }; save(LS_PROFILE, state.profile);
      }
      var weeks = {};
      r.bookings.forEach(function (b) { weeks[Core.mondayOf(b.date)] = true; });
      Object.keys(weeks).forEach(function (w) { delete state.cache[w]; });
      state.selected = {};
      $('desc').value = '';
      $('bookDialog').close();
      showDone(r.bookings);
      loadWeek(true);
    }).catch(function (err) {
      showFormError(err.message);
      if (/already booked|reserved|started|too soon/.test(err.message)) {
        delete state.cache[state.weekStart];
        fetchWeek(state.weekStart).then(function () { pruneSelection(); render(); renderPicked(); });
      }
    }).then(function () { btn.disabled = false; if (btn.textContent === 'Booking…') btn.textContent = label; renderPicked(); });
  }

  /** Drop selections that are no longer open after a refresh. */
  function pruneSelection() {
    Object.keys(state.selected).forEach(function (k) {
      var wk = Core.mondayOf(state.selected[k].date);
      if (!state.cache[wk]) return;
      if (state.cache[wk].some(function (b) { return b.date + '|' + b.slot + '|' + b.space === k; })) delete state.selected[k];
    });
  }

  function showDone(bookings) {
    var first = bookings[0];
    $('doneStamp').textContent = first.label;
    var multiSpace = state.cfg.settings.spaces.length > 1;
    $('doneList').innerHTML = bookings.map(function (b) {
      return '<li><span><b>' + esc(b.slot) + '</b><br>' + Core.fmtDateLong(b.date) + (multiSpace ? ', ' + esc(b.space) : '') + '</span></li>';
    }).join('');
    var s = state.cfg.settings;
    $('doneNote').textContent = (s.sendConfirmation && !Api.demo ? 'A confirmation is on its way to your email. ' : '') +
      (s.allowTeacherCancel ? 'You can cancel from “My bookings” on this device' + (s.sendConfirmation && !Api.demo ? ', or with the link in the email.' : '.') : '');
    $('doneDialog').showModal();
  }

  // ------------------------------------------------------------ My bookings

  function openMine() {
    $('mineBody').innerHTML = '<p class="empty">Loading…</p>';
    if (!$('mineDialog').open) $('mineDialog').showModal();
    if (!state.groups.length) { renderMine([]); return; }
    Api.call('mine', { groups: state.groups }).then(function (r) { renderMine(r.bookings); })
      .catch(function (e) { $('mineBody').innerHTML = '<p class="form-error">' + esc(e.message) + '</p>'; });
  }

  function renderMine(bookings) {
    var s = state.cfg.settings;
    if (!bookings.length) {
      $('mineBody').innerHTML = '<p class="empty">No upcoming bookings made on this device. ' +
        (s.sendConfirmation && !Api.demo ? 'Booked on another device? Use the link in your confirmation email to manage it.' : '') + '</p>';
      return;
    }
    var groups = {}, order = [];
    bookings.forEach(function (b) { if (!groups[b.groupId]) { groups[b.groupId] = []; order.push(b.groupId); } groups[b.groupId].push(b); });
    order.sort(function (a, b) { return groups[a][0].date < groups[b][0].date ? -1 : 1; });
    $('mineBody').innerHTML = order.map(function (gid) {
      var list = groups[gid].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : Core.slotIndex(s, a.slot) - Core.slotIndex(s, b.slot); });
      return '<section class="mine-group"><h3>' + esc(list[0].label) + '</h3><ul class="picked-list">' +
        list.map(function (b) {
          return '<li><span><b>' + esc(b.slot) + '</b><br>' + Core.fmtDateLong(b.date) + '</span>' +
            (s.allowTeacherCancel ? '<button type="button" class="btn btn-danger btn-small" data-cancel="' + esc(gid) + '" data-id="' + esc(b.id) + '">Cancel</button>' : '') + '</li>';
        }).join('') + '</ul>' +
        (s.allowTeacherCancel && list.length > 1 ? '<button type="button" class="btn btn-danger btn-small" data-cancel="' + esc(gid) + '">Cancel all ' + list.length + '</button>' : '') +
        '</section>';
    }).join('') + (s.allowTeacherCancel ? '' : '<p class="muted">To cancel, please contact the librarian.</p>');
  }

  function cancelClick(btn) {
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm'); btn.dataset.label = btn.textContent; btn.textContent = 'Tap again to cancel';
      setTimeout(function () { if (btn.isConnected) { btn.classList.remove('is-confirm'); btn.textContent = btn.dataset.label; } }, 4000);
      return;
    }
    var gid = btn.dataset.cancel, g = state.groups.filter(function (x) { return x.groupId === gid; })[0];
    if (!g) return;
    btn.disabled = true; btn.textContent = 'Cancelling…';
    Api.call('cancel', { groupId: gid, token: g.token, ids: btn.dataset.id ? [btn.dataset.id] : [] }).then(function () {
      toast('Booking cancelled');
      state.cache = {};
      loadWeek(true);
      openMine();
    }).catch(function (e) { toast(e.message, true); btn.disabled = false; btn.textContent = btn.dataset.label; btn.classList.remove('is-confirm'); });
  }

  // ------------------------------------------------------------ Events

  function goWeek(delta) {
    state.weekStart = Core.addDays(state.weekStart, 7 * delta);
    if (delta !== 0) state.dayIndex = delta > 0 ? 0 : 4;
    loadWeek();
  }

  function setDay(i) {
    if (i < 0) { goWeek(-1); return; }
    if (i > 4) { goWeek(1); return; }
    state.dayIndex = i; render();
  }

  function bind() {
    $('prevWeek').onclick = function () { goWeek(-1); };
    $('nextWeek').onclick = function () { goWeek(1); };
    $('thisWeek').onclick = function () { state.weekStart = Core.mondayOf(torontoNow().date); pickDefaultDay(); loadWeek(); };
    $('jumpDate').addEventListener('change', function () {
      var v = this.value; if (!Core.isDateStr(v)) return;
      state.weekStart = Core.mondayOf(v);
      var w = Core.weekday(v); state.dayIndex = w >= 1 && w <= 5 ? w - 1 : 0;
      loadWeek();
    });
    $('weekLabelWrap').addEventListener('click', function (e) {
      var inp = $('jumpDate');
      if (e.target !== inp && inp.showPicker) { try { inp.showPicker(); } catch (x) { } }
    });

    $('grid').addEventListener('click', function (e) {
      var btn = e.target.closest('button.slot-open');
      if (!btn) return;
      var key = btn.dataset.key, p = key.split('|');
      if (state.selected[key]) delete state.selected[key];
      else state.selected[key] = { date: p[0], slot: p[1], space: p[2] };
      btn.classList.toggle('is-picked', !!state.selected[key]);
      btn.setAttribute('aria-pressed', !!state.selected[key]);
      btn.querySelector('.slot-state').textContent = state.selected[key] ? 'Selected' : 'Open';
      renderTray();
    });

    $('dayTabs').addEventListener('click', function (e) {
      var t = e.target.closest('.daytab'); if (t) setDay(+t.dataset.day);
    });

    // Swipe between days on phones
    var sx = 0, sy = 0, st = 0;
    $('gridWrap').addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    $('gridWrap').addEventListener('touchend', function (e) {
      if (!isMobile()) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 600) setDay(state.dayIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft' && e.altKey) goWeek(-1);
      if (e.key === 'ArrowRight' && e.altKey) goWeek(1);
    });

    $('trayClear').onclick = function () { state.selected = {}; render(); };
    $('trayGo').onclick = openBooking;
    $('bookForm').addEventListener('submit', submitBooking);
    $('teacherAdd').onclick = function () { addTeacher(true); $('teacherInput').focus(); };
    $('teacherInput').addEventListener('input', function () { addTeacher(false); });
    $('teacherInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTeacher(true); } });
    $('teacherChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]'); if (!c) return;
      state.draftTeachers.splice(+c.dataset.chip, 1); renderTeacherChips();
    });
    $('pickedList').addEventListener('click', function (e) {
      var x = e.target.closest('[data-unpick]'); if (!x) return;
      delete state.selected[x.dataset.unpick]; renderPicked(); render();
    });
    $('myBookingsBtn').onclick = openMine;
    $('mineBody').addEventListener('click', function (e) { var b = e.target.closest('[data-cancel]'); if (b) cancelClick(b); });

    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) d.close();
        else if (e.target === d) { // backdrop click
          var r = d.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
        }
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.weekStart && Date.now() - (state.loadedAt[state.weekStart] || 0) > 30000) {
        state.cache = {}; loadWeek(true);
      }
    });
  }

  start();
})();
