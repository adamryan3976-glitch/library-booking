/* Winchester P.S. Library Booking — teacher page */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LS_PROFILE = 'wps-library-profile', LS_GROUPS = 'wps-library-groups', LS_AUTH = 'wps-library-auth';
  var CLIENT_ID = ((window.LIBRARY_CONFIG || {}).googleClientId || '').trim();
  var HOSTED_DOMAIN = ((window.LIBRARY_CONFIG || {}).googleHostedDomain || '').trim().toLowerCase();

  var state = {
    cfg: null, weekStart: null, cache: {}, loadedAt: {}, selected: {}, dayIndex: 0,
    profile: load(LS_PROFILE, { teachers: [], email: '', grades: [] }),
    groups: load(LS_GROUPS, []),     // { groupId, token } for bookings made on this device or opened from an email link
    mineIds: {},                     // groupIds known to belong to this teacher (for highlighting)
    mineGroups: {},                  // groupId -> bookings, from the last "My bookings" load
    editing: null,                   // { groupId, rows, remove: {id: true} } while changing a booking
    draftTeachers: [], loadToken: 0
  };

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function forget(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function split(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

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
  function slotOf(name) { var s = state.cfg.settings; return s.slots[Core.slotIndex(s, name)] || {}; }
  function sortItems(list) {
    var s = state.cfg.settings;
    return list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : Core.slotIndex(s, a.slot) - Core.slotIndex(s, b.slot); });
  }

  // ------------------------------------------------------------ Google sign-in

  var Auth = {
    enabled: !!CLIENT_ID,
    session: null, // { token, exp, email, name, given, family }
    pending: null,
    ready: false,

    init: function () {
      if (!this.enabled) return;
      var saved = load(LS_AUTH, null);
      if (saved && saved.exp * 1000 > Date.now() + 60000) this.use(saved, true);
      else forget(LS_AUTH);
      this.render();
      var sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
      sc.onload = function () { Auth.setup(); };
      sc.onerror = function () { Auth.fail('Google sign-in couldn’t load. Check your connection, or that your browser isn’t blocking accounts.google.com.'); };
      document.head.appendChild(sc);
    },

    setup: function () {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: function (r) { Auth.onCredential(r); },
        auto_select: true,
        hd: HOSTED_DOMAIN || undefined,
        use_fedcm_for_prompt: true,
        itp_support: true,
        cancel_on_tap_outside: false
      });
      var look = { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 };
      google.accounts.id.renderButton($('gsiButton'), look);
      google.accounts.id.renderButton($('gateButton'), look);
      this.ready = true;
      // Returning teachers get signed back in quietly when their sign-in has run out.
      if (!this.valid()) google.accounts.id.prompt();
      // Sign-ins last about an hour; renew quietly a few minutes before that.
      setInterval(function () {
        if (Auth.session && Auth.session.exp * 1000 - Date.now() < 5 * 60000) google.accounts.id.prompt();
      }, 60000);
    },

    /** Cover the page until the teacher signs in, then run fn. */
    gate: function (fn) {
      this.use(null);
      this.pending = fn;
      this.step('gateSignin', 'Book the library');
      if (this.ready) google.accounts.id.prompt();
    },

    /** Show one panel of the sign-in screen. */
    step: function (id, title) {
      document.body.classList.add('is-gated');
      $('gate').hidden = false;
      ['gateSignin', 'gateRequest', 'gatePending', 'gateDenied'].forEach(function (x) { $(x).hidden = x !== id; });
      $('gateTitle').textContent = title;
      $('gateError').hidden = true;
      $('gateSwitch').hidden = id === 'gateSignin';
      $('gateButton').hidden = false;
      $('gateText').textContent = GATE_TEXT;
      var email = this.session ? this.session.email : '';
      document.querySelectorAll('.gate-email').forEach(function (el) { el.textContent = email; });
    },

    /** Signed in, but not (yet) on the approved staff list. */
    showAccess: function (status) {
      if (status === 'pending') return this.step('gatePending', 'Request sent');
      if (status === 'denied') return this.step('gateDenied', 'No access');
      this.step('gateRequest', 'Request access');
      if (!$('reqName').value && this.session) $('reqName').value = this.session.name || '';
    },

    ungate: function () {
      document.body.classList.remove('is-gated');
      $('gate').hidden = true;
    },

    onCredential: function (resp) {
      try {
        var c = JSON.parse(decodeURIComponent(escape(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
        var domain = HOSTED_DOMAIN || (state.cfg && state.cfg.settings.emailDomain) || '';
        if (domain && String(c.email).toLowerCase().slice(-(domain.length + 1)) !== '@' + domain.toLowerCase()) {
          return this.fail('That’s not a school account. Please sign in with your @' + domain + ' Google account.');
        }
        this.use({ token: resp.credential, exp: c.exp, email: String(c.email).toLowerCase(), name: c.name || '', given: c.given_name || '', family: c.family_name || '' });
        save(LS_AUTH, this.session); save(LS_AUTH + '-seen', true);
        $('signinError').hidden = true; $('gateError').hidden = true;
        var next = this.pending; this.pending = null;
        if ($('signinDialog').open) $('signinDialog').close();
        if (state.cfg) { this.ungate(); refreshMineIds(); }
        else { $('gateText').textContent = 'Signed in. Opening the calendar…'; $('gateButton').hidden = true; }
        if (next) next();
      } catch (e) { this.fail('Sign-in didn’t work. Please try again.'); }
    },

    use: function (sess, quiet) {
      this.session = sess;
      Api.setIdToken(sess ? sess.token : null);
      if (!quiet) this.render();
    },

    valid: function () { return !!(this.session && this.session.exp * 1000 > Date.now() + 60000); },

    /** Run fn now if signed in (or sign-in is off); otherwise ask the teacher to sign in first. */
    require: function (fn) {
      if (!this.enabled || this.valid()) return fn();
      this.use(null);
      this.pending = fn;
      $('signinError').hidden = true;
      $('signinDialog').showModal();
      if (this.ready) google.accounts.id.prompt();
    },

    signOut: function () {
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      forget(LS_AUTH); forget(LS_AUTH + '-seen');
      location.replace(location.pathname);
    },

    fail: function (msg) {
      if (document.body.classList.contains('is-gated')) { $('gateError').textContent = msg; $('gateError').hidden = false; return; }
      if (!state.cfg) { this.step('gateSignin', 'Book the library'); $('gateError').textContent = msg; $('gateError').hidden = false; return; }
      $('signinError').textContent = msg; $('signinError').hidden = false;
      if (!$('signinDialog').open && this.pending) $('signinDialog').showModal();
    },

    /** A request was turned away because the sign-in ran out: sign in again, then retry. */
    expired: function (retry) {
      this.use(null); forget(LS_AUTH);
      if (!state.cfg) return this.gate(retry);
      this.require(retry);
    },

    render: function () {
      if (!this.enabled) return;
      var on = this.valid();
      $('whoChip').hidden = !on;
      $('signInBtn').hidden = on;
      if (on) $('whoName').textContent = this.session.name || this.session.email;
    }
  };

  // ------------------------------------------------------------ Start-up

  var GATE_TEXT = 'Sign in with your ' + (HOSTED_DOMAIN ? '@' + HOSTED_DOMAIN + ' ' : 'school ') + 'Google account to see the library calendar and book times.';

  function start() {
    if (Api.demo) $('demoNotice').hidden = false;
    bind();
    $('gateText').textContent = GATE_TEXT;
    if (Auth.enabled) {
      Auth.init();
      if (Auth.valid()) boot(); else Auth.gate(boot);
    } else {
      boot();
    }
  }

  function boot() {
    Api.call('init').then(function (cfg) {
      state.cfg = cfg;
      Auth.ungate();
      applySettings();
      Auth.render();
      var params = new URLSearchParams(location.search);
      var startDate = params.get('date');
      state.weekStart = Core.mondayOf(Core.isDateStr(startDate) ? startDate : torontoNow().date);
      pickDefaultDay();
      loadWeek();
      if (params.get('booking') && params.get('token')) {
        addGroup(params.get('booking'), params.get('token'));
        history.replaceState(null, '', location.pathname);
        openMine();
      } else {
        refreshMineIds();
      }
    }).catch(function (e) {
      if (e.auth) return Auth.expired(boot);
      if (e.access) return Auth.showAccess(e.access);
      $('loading').textContent = e.message;
      $('gridWrap').classList.add('is-loading');
    });
  }

  function applySettings() {
    var s = state.cfg.settings;
    document.querySelectorAll('[data-bind]').forEach(function (el) { el.textContent = s[el.getAttribute('data-bind')] || el.textContent; });
    document.title = s.siteTitle + ' – ' + s.schoolName;
    if (s.announcement) { $('announcement').textContent = s.announcement; $('announcement').hidden = false; }
    if (!s.bookingsOpen) { $('closedNotice').textContent = s.closedMessage; $('closedNotice').hidden = false; }
    if (s.showLibrarian) { $('librarianNote').textContent = '“' + s.librarianLabel + '” notes show when the librarian is away from the library.'; $('librarianNote').hidden = false; }
    $('email').placeholder = 'name@' + (s.emailDomain || 'school.ca');
    if (s.emailDomain) $('signinText').textContent = 'Use your @' + s.emailDomain + ' Google account. Your email is filled in for you, and you can see and change your bookings from any device.';
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
      if (e.auth) return Auth.expired(function () { loadWeek(true); });
      if (e.access) return Auth.showAccess(e.access);
      toast(e.message, true);
    });
  }

  function fetchWeek(wk) {
    return Api.call('bookings', { from: wk, to: Core.addDays(wk, 4) }).then(function (r) {
      state.cache[wk] = r.bookings; state.loadedAt[wk] = Date.now();
    });
  }

  function prefetch(wk) { if (!state.cache[wk]) fetchWeek(wk).catch(function () { }); }

  function addGroup(groupId, token) {
    if (!state.groups.some(function (g) { return g.groupId === groupId; })) {
      state.groups.push({ groupId: groupId, token: token }); save(LS_GROUPS, state.groups);
    }
    state.mineIds[groupId] = true;
  }
  function tokenFor(gid) { var g = state.groups.filter(function (x) { return x.groupId === gid; })[0]; return g ? g.token : ''; }

  /** Load this teacher's bookings: by private links saved on this device, plus by email when signed in. */
  function fetchMine() {
    return Api.call('mine', { groups: state.groups }).then(function (r) {
      var groups = {};
      r.bookings.forEach(function (b) { (groups[b.groupId] = groups[b.groupId] || []).push(b); state.mineIds[b.groupId] = true; });
      state.mineGroups = groups;
      return groups;
    });
  }

  function refreshMineIds() {
    if (!state.groups.length && !Auth.valid()) return;
    fetchMine().then(render).catch(function () { });
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

  function slotState(date, slot, space, ctx) {
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
    var lastDay = Core.addDays(now.date, s.windowDays || 0);
    var multiSpace = s.spaces.length > 1;
    var editGid = state.editing && state.editing.groupId;

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
          var st = slotState(d, slot, space, ctx);
          var spaceTag = multiSpace ? '<span class="slot-space">' + esc(space) + '</span>' : '';
          if (st.kind === 'booked') {
            var b = st.booking, isMine = state.mineIds[b.groupId];
            var editingThis = editGid && b.groupId === editGid;
            cell += '<div class="slot slot-booked' + (isMine ? ' is-mine' : '') + (editingThis && state.editing.remove[b.id] ? ' is-removing' : '') + '" title="' + esc(b.label) + '">' + spaceTag +
              '<span class="who">' + esc(b.teachers) + (b.grades ? ' <span class="what">(' + esc(b.grades) + ')</span>' : '') + '</span>' +
              '<span class="what">' + esc(b.description) + '</span></div>';
          } else if (st.kind === 'reserved') {
            cell += '<div class="slot slot-reserved">' + spaceTag + '<span class="who">' + esc(st.label) + '</span></div>';
          } else if (st.kind === 'open') {
            var picked = !!state.selected[st.key];
            cell += '<button type="button" class="slot slot-open' + (picked ? ' is-picked' : '') + '" data-key="' + esc(st.key) + '" aria-pressed="' + picked + '" ' +
              'aria-label="' + esc(slot.name + ', ' + Core.fmtDateLong(d) + (multiSpace ? ', ' + space : '') + (picked ? ', selected' : ', open')) + '">' +
              spaceTag + '<span class="slot-state">' + (picked ? 'Selected' : (editGid ? 'Add' : 'Open')) + '</span></button>';
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
    return sortItems(Object.keys(state.selected).map(function (k) { return state.selected[k]; }));
  }

  function groupedSummary(items) {
    var byDate = {};
    items.forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it.slot); });
    return Object.keys(byDate).map(function (d) {
      return Core.DAYS[Core.weekday(d)].slice(0, 3) + ' ' + Core.fmtDateShort(d) + ': ' + byDate[d].join(', ');
    }).join('; ');
  }

  function renderTray() {
    var items = selectedItems(), ed = state.editing;
    $('tray').classList.toggle('is-editing', !!ed);
    $('tray').hidden = !items.length && !ed;
    if (ed) {
      $('trayCount').textContent = 'Changing: ' + ed.rows[0].label;
      $('traySummary').textContent = items.length ? 'Adding ' + groupedSummary(items) : 'Tap open times to add them to this booking.';
      $('trayClear').textContent = 'Stop';
      $('trayGo').textContent = 'Review changes';
      return;
    }
    $('trayClear').textContent = 'Clear';
    $('trayGo').textContent = 'Book';
    if (!items.length) return;
    $('trayCount').textContent = items.length + (items.length === 1 ? ' time selected' : ' times selected');
    $('traySummary').textContent = groupedSummary(items);
  }

  // ------------------------------------------------------------ Booking / editing form

  function openBooking() {
    var ed = state.editing, s = state.cfg.settings;
    if (!ed && !selectedItems().length) return;
    var p = state.profile;
    var teachers, grades, desc;
    if (ed) {
      var b = ed.rows[0];
      teachers = split(b.teachers); grades = split(b.grades); desc = b.description;
    } else {
      teachers = (p.teachers || []).slice(); grades = p.grades || []; desc = $('desc').value;
      // First booking after signing in: start with the teacher's own name if it's on the staff list.
      if (!teachers.length && Auth.valid()) {
        var mine = [(state.cfg.me && state.cfg.me.name) || '', Auth.session.family || ''];
        var listed = (state.cfg.me && state.cfg.me.name || '').split(/\s+/).pop();
        mine.push(listed);
        var match = s.teachers.filter(function (t) {
          return mine.some(function (m) { return m && t.toLowerCase() === m.toLowerCase(); });
        })[0];
        if (match) teachers = [match];
      }
    }
    state.draftTeachers = teachers;
    renderTeacherChips();
    document.querySelectorAll('#gradeToggles input').forEach(function (i) { i.checked = grades.indexOf(i.value) >= 0; });
    $('gradeOther').value = grades.filter(function (g) { return s.grades.indexOf(g) < 0; }).join(', ');
    $('desc').value = desc;
    var signedIn = Auth.enabled && Auth.valid();
    $('emailField').hidden = signedIn || !!ed;
    $('bookingAs').hidden = !(signedIn || ed);
    $('bookingAs').textContent = signedIn ? 'Booking as ' + Auth.session.email : '';
    if (ed && !signedIn) $('bookingAs').hidden = true;
    $('email').value = p.email || '';
    $('remember').parentNode.hidden = !!ed;
    $('bookTitle').textContent = ed ? 'Change booking' : 'Book the library';
    $('bookClose').textContent = ed ? 'Close' : 'Cancel';
    $('addMoreBtn').hidden = !ed;
    $('bookError').hidden = true;
    renderPicked();
    $('bookDialog').showModal();
    setTimeout(function () { (state.draftTeachers.length ? $('desc') : $('teacherInput')).focus(); }, 50);
  }

  function renderPicked() {
    var ed = state.editing, s = state.cfg.settings;
    var multiSpace = s.spaces.length > 1;
    function line(it, extra) {
      var sl = slotOf(it.slot);
      return '<span><b>' + esc(it.slot) + '</b> <small>' + Core.fmtTime(sl.start) + '–' + Core.fmtTime(sl.end) + '</small>' + (extra || '') + '<br>' +
        Core.fmtDateLong(it.date) + (multiSpace ? ', ' + esc(it.space) : '') + '</span>';
    }
    var html = '';
    var today = torontoNow().date;
    if (ed) {
      html += sortItems(ed.rows.slice()).map(function (b) {
        var off = !!ed.remove[b.id];
        var ctrl = b.date < today ? '' : off
          ? '<button type="button" class="undo" data-keep="' + esc(b.id) + '">Undo</button>'
          : '<button type="button" class="x" data-drop="' + esc(b.id) + '" aria-label="Remove ' + esc(b.slot) + '">×</button>';
        return '<li class="' + (off ? 'is-removed' : '') + '">' + line(b) + ctrl + '</li>';
      }).join('');
    }
    html += selectedItems().map(function (it) {
      return '<li>' + line(it, ed ? '<span class="tag">New</span>' : '') +
        '<button type="button" class="x" data-unpick="' + esc(it.date + '|' + it.slot + '|' + it.space) + '" aria-label="Remove ' + esc(it.slot) + '">×</button></li>';
    }).join('');
    $('pickedList').innerHTML = html;

    var n = selectedItems().length;
    if (ed) {
      var left = ed.rows.filter(function (b) { return !ed.remove[b.id]; }).length + n;
      $('bookSubmit').textContent = left ? 'Save changes' : 'Cancel this booking';
      $('bookSubmit').classList.toggle('btn-danger', !left);
      $('bookSubmit').classList.toggle('btn-primary', !!left);
    } else {
      $('bookSubmit').classList.remove('btn-danger'); $('bookSubmit').classList.add('btn-primary');
      $('bookSubmit').textContent = n === 1 ? 'Book 1 time' : 'Book ' + n + ' times';
      if (!n && $('bookDialog').open) $('bookDialog').close();
    }
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

  function readDetails() {
    if ($('teacherInput').value.trim()) addTeacher(true);
    var grades = Array.prototype.map.call(document.querySelectorAll('#gradeToggles input:checked'), function (i) { return i.value; })
      .concat(split($('gradeOther').value));
    return { teachers: state.draftTeachers.slice(), grades: grades, description: $('desc').value.trim() };
  }

  function submitBooking(e) {
    e.preventDefault();
    var det = readDetails();
    if (!det.teachers.length) return showFormError('Add at least one teacher.');
    if (!det.description) return showFormError('Add a short description of what you’re doing.');
    var ed = state.editing;
    var signedIn = Auth.enabled && Auth.valid();
    var payload = Object.assign({}, det), action;
    if (ed) {
      action = 'update';
      payload.groupId = ed.groupId; payload.token = tokenFor(ed.groupId);
      payload.removeIds = Object.keys(ed.remove); payload.addItems = selectedItems();
    } else {
      action = 'book';
      payload.items = selectedItems();
      payload.email = signedIn ? Auth.session.email : $('email').value.trim();
      if (!payload.email) return showFormError('Enter your school email so you get a confirmation.');
    }
    $('bookError').hidden = true;
    var btn = $('bookSubmit'), label = btn.textContent;
    btn.disabled = true; btn.textContent = ed ? 'Saving…' : 'Booking…';
    Api.call(action, payload).then(function (r) {
      if (!ed) {
        addGroup(r.groupId, r.token);
        if ($('remember').checked) {
          state.profile = { teachers: det.teachers, email: payload.email, grades: det.grades }; save(LS_PROFILE, state.profile);
        }
      }
      var weeks = {};
      r.bookings.concat(ed ? ed.rows : []).forEach(function (b) { weeks[Core.mondayOf(b.date)] = true; });
      Object.keys(weeks).forEach(function (w) { delete state.cache[w]; });
      state.selected = {};
      $('desc').value = '';
      $('bookDialog').close();
      if (ed) {
        exitEdit(true);
        toast(r.bookings.length ? 'Booking updated' : 'Booking cancelled');
      } else {
        showDone(r.bookings);
      }
      loadWeek(true);
    }).catch(function (err) {
      if (err.auth) { btn.disabled = false; btn.textContent = label; return Auth.expired(function () { $('bookForm').requestSubmit(); }); }
      if (err.access) { $('bookDialog').close(); return Auth.showAccess(err.access); }
      showFormError(err.message);
      if (/already booked|reserved|started|too soon/.test(err.message)) {
        delete state.cache[state.weekStart];
        fetchWeek(state.weekStart).then(function () { pruneSelection(); render(); renderPicked(); });
      }
    }).then(function () { btn.disabled = false; if (/…$/.test(btn.textContent)) btn.textContent = label; if ($('bookDialog').open) renderPicked(); });
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
    var s = state.cfg.settings, mail = s.sendConfirmation && !Api.demo;
    $('doneNote').textContent = (mail ? 'A confirmation is on its way to your email. ' : '') +
      (s.allowTeacherCancel ? 'You can change or cancel it from “My bookings”' +
        (Auth.enabled ? ' on any device.' : ' on this device' + (mail ? ', or with the link in the email.' : '.')) : '');
    $('doneDialog').showModal();
  }

  // ------------------------------------------------------------ Edit mode

  function startEdit(gid) {
    var rows = state.mineGroups[gid];
    if (!rows || !rows.length) return;
    state.editing = { groupId: gid, rows: rows.slice(), remove: {} };
    state.selected = {};
    $('mineDialog').close();
    var wk = Core.mondayOf(rows[0].date);
    state.dayIndex = Math.min(4, Math.max(0, Core.weekday(rows[0].date) - 1));
    if (wk !== state.weekStart) { state.weekStart = wk; loadWeek(); } else render();
    openBooking();
  }

  function exitEdit(quiet) {
    if (!state.editing) return;
    state.editing = null; state.selected = {};
    if (!quiet) render(); else renderTray();
  }

  // ------------------------------------------------------------ My bookings

  function openMine() {
    $('mineBody').innerHTML = '<p class="empty">Loading…</p>';
    if (!$('mineDialog').open) $('mineDialog').showModal();
    if (!state.groups.length && !Auth.valid()) { renderMine({}); return; }
    fetchMine().then(renderMine).catch(function (e) {
      if (e.auth) { $('mineDialog').close(); return Auth.expired(openMine); }
      $('mineBody').innerHTML = '<p class="form-error">' + esc(e.message) + '</p>';
    });
  }

  function mineFoot() {
    if (!Auth.enabled || !Auth.session) return '';
    return '<div class="mine-foot"><span>Signed in as ' + esc(Auth.session.email) + '</span>' +
      '<button type="button" class="btn btn-quiet btn-small" data-signout>Sign out</button></div>';
  }

  function renderMine(groups) {
    var s = state.cfg.settings;
    var order = Object.keys(groups);
    if (!order.length) {
      $('mineBody').innerHTML = '<p class="empty">No upcoming bookings' + (Auth.enabled ? ' for ' + esc(Auth.session ? Auth.session.email : 'you') + '.' :
        ' made on this device. ' + (s.sendConfirmation && !Api.demo ? 'Booked on another device? Use the link in your confirmation email to manage it.' : '')) + '</p>' + mineFoot();
      return;
    }
    order.sort(function (a, b) { return groups[a][0].date < groups[b][0].date ? -1 : 1; });
    $('mineBody').innerHTML = order.map(function (gid) {
      var list = sortItems(groups[gid]);
      return '<section class="mine-group"><h3>' + esc(list[0].label) + '</h3><ul class="picked-list">' +
        list.map(function (b) {
          return '<li><span><b>' + esc(b.slot) + '</b><br>' + Core.fmtDateLong(b.date) + '</span>' +
            (s.allowTeacherCancel ? '<button type="button" class="btn btn-danger btn-small" data-cancel="' + esc(gid) + '" data-id="' + esc(b.id) + '">Cancel</button>' : '') + '</li>';
        }).join('') + '</ul>' +
        (s.allowTeacherCancel ? '<div class="mine-actions"><button type="button" class="btn btn-quiet btn-small" data-edit="' + esc(gid) + '">Change booking</button>' +
          (list.length > 1 ? '<button type="button" class="btn btn-danger btn-small" data-cancel="' + esc(gid) + '">Cancel all ' + list.length + '</button>' : '') + '</div>' : '') +
        '</section>';
    }).join('') + (s.allowTeacherCancel ? '' : '<p class="muted">To change or cancel, please contact the librarian.</p>') + mineFoot();
  }

  function cancelClick(btn) {
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm'); btn.dataset.label = btn.textContent; btn.textContent = 'Tap again to cancel';
      setTimeout(function () { if (btn.isConnected) { btn.classList.remove('is-confirm'); btn.textContent = btn.dataset.label; } }, 4000);
      return;
    }
    var gid = btn.dataset.cancel;
    btn.disabled = true; btn.textContent = 'Cancelling…';
    Api.call('cancel', { groupId: gid, token: tokenFor(gid), ids: btn.dataset.id ? [btn.dataset.id] : [] }).then(function () {
      toast('Booking cancelled');
      state.cache = {};
      loadWeek(true);
      openMine();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = btn.dataset.label; btn.classList.remove('is-confirm');
      if (e.auth) return Auth.expired(openMine);
      toast(e.message, true);
    });
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
      btn.querySelector('.slot-state').textContent = state.selected[key] ? 'Selected' : (state.editing ? 'Add' : 'Open');
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

    $('trayClear').onclick = function () { if (state.editing) exitEdit(); else { state.selected = {}; render(); } };
    $('trayGo').onclick = function () { if (state.editing) openBooking(); else Auth.require(openBooking); };
    $('bookForm').addEventListener('submit', submitBooking);
    $('addMoreBtn').onclick = function () {
      $('bookDialog').close();
      toast('Tap open times to add them, then tap Review changes.');
    };
    $('teacherAdd').onclick = function () { addTeacher(true); $('teacherInput').focus(); };
    $('teacherInput').addEventListener('input', function () { addTeacher(false); });
    $('teacherInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTeacher(true); } });
    $('teacherChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]'); if (!c) return;
      state.draftTeachers.splice(+c.dataset.chip, 1); renderTeacherChips();
    });
    $('pickedList').addEventListener('click', function (e) {
      var x = e.target.closest('[data-unpick]');
      if (x) { delete state.selected[x.dataset.unpick]; renderPicked(); render(); return; }
      var d = e.target.closest('[data-drop]');
      if (d && state.editing) { state.editing.remove[d.dataset.drop] = true; renderPicked(); return; }
      var k = e.target.closest('[data-keep]');
      if (k && state.editing) { delete state.editing.remove[k.dataset.keep]; renderPicked(); }
    });
    $('myBookingsBtn').onclick = function () { Auth.require(openMine); };
    $('signInBtn').onclick = function () { Auth.require(function () { toast('Signed in as ' + Auth.session.email); }); };
    $('signOutBtn').onclick = function () { Auth.signOut(); };
    $('mineBody').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cancel]'); if (c) return cancelClick(c);
      var ed = e.target.closest('[data-edit]'); if (ed) startEdit(ed.dataset.edit);
      if (e.target.closest('[data-signout]')) Auth.signOut();
    });
    $('signinDialog').addEventListener('close', function () { Auth.pending = null; });
    $('gateSwitch').onclick = function () { Auth.signOut(); };
    $('gateRecheck').onclick = function () {
      var b = this; b.disabled = true; b.textContent = 'Checking…';
      boot();
      setTimeout(function () { b.disabled = false; b.textContent = 'Check again'; }, 2500);
    };
    $('gateRequest').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('reqName').value.trim();
      if (!name) { $('gateError').textContent = 'Add your name so the librarian knows who you are.'; $('gateError').hidden = false; return; }
      var b = $('reqSubmit'); b.disabled = true; b.textContent = 'Sending…';
      Api.call('requestAccess', { name: name, note: $('reqNote').value.trim() }).then(function (r) {
        if (r.access === 'approved') return boot();
        Auth.showAccess('pending');
      }).catch(function (err) {
        if (err.auth) return Auth.expired(function () { Auth.showAccess('none'); });
        if (err.access) return Auth.showAccess(err.access);
        $('gateError').textContent = err.message; $('gateError').hidden = false;
      }).then(function () { b.disabled = false; b.textContent = 'Request access'; });
    });

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
