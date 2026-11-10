/* Talks to the Apps Script backend, or to an in-browser demo backend when no URL is set. */
var Api = (function () {
  'use strict';
  var url = ((window.LIBRARY_CONFIG || {}).apiUrl || '').trim();
  var demo = !url;
  var GET_ACTIONS = { init: true, bookings: true };
  var TEACHER_ACTIONS = { book: true, mine: true, cancel: true, update: true };
  var idToken = null;

  function call(action, payload) {
    payload = Object.assign({}, payload || {});
    if (idToken && TEACHER_ACTIONS[action]) payload.idToken = idToken;
    if (demo) return Demo.call(action, payload);
    var req;
    if (GET_ACTIONS[action]) {
      var q = new URLSearchParams({ action: action });
      Object.keys(payload).forEach(function (k) { q.set(k, payload[k]); });
      req = fetch(url + '?' + q.toString());
    } else {
      req = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, payload))
      });
    }
    return req.then(function (res) { return res.json(); }, function () {
      throw new Error('Can’t reach the booking server. Check your connection and try again.');
    }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || 'The server could not complete that request.'); e.auth = !!j.auth; throw e; }
      return j.data;
    });
  }

  // ---------------- Demo backend (localStorage) ----------------
  var Demo = (function () {
    var KEY = 'wps-library-demo-v1';
    var mem = null;
    function read() {
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
      if (!mem) mem = seed();
      return mem;
    }
    function write() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* memory only */ } }
    var counter = 0;
    function newId() { counter++; return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + counter).slice(-12); }

    function now() {
      var parts = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var h = +parts.hour % 24;
      return { date: parts.year + '-' + parts.month + '-' + parts.day, minutes: h * 60 + +parts.minute,
        stamp: parts.year + '-' + parts.month + '-' + parts.day + ' ' + (h < 10 ? '0' : '') + h + ':' + parts.minute + ':' + parts.second };
    }

    function seed() {
      var data = {
        settings: JSON.parse(JSON.stringify(Core.DEFAULT_SETTINGS)),
        calendar: JSON.parse(JSON.stringify(Core.DEFAULT_CALENDAR)),
        statics: JSON.parse(JSON.stringify(Core.DEFAULT_STATICS)),
        librarian: JSON.parse(JSON.stringify(Core.DEFAULT_LIBRARIAN)),
        bookings: [], passcode: 'changeme'
      };
      data.settings.siteUrl = location.origin + location.pathname.replace(/[^/]*$/, '').replace(/\/$/, '');
      // A few sample bookings over the next two weeks so the calendar isn't empty.
      var samples = [
        [1, 'Period 6', 'McVeen', '3, 4', 'Book Exchange'],
        [1, 'Period 9', 'McMurtrie', '3, 4', 'Book exchange'],
        [2, 'Period 7', 'Cole, Adams', '7, 8', 'Lit Circles'],
        [2, 'Period 8', 'Cole, Adams', '7, 8', 'Lit Circles'],
        [3, 'Lunch', 'Paquin', '4, 5, 6, 7, 8', 'D&D Club'],
        [4, 'Period 2', 'Bennett', '5, 6', 'Book exchange'],
        [6, 'Period 1', 'E. Wright', 'Gifted Testing', 'Gifted Testing'],
        [6, 'Period 2', 'E. Wright', 'Gifted Testing', 'Gifted Testing'],
        [7, 'Period 5', 'Paulino', '1, 2', 'Book Exchange - Whole Class'],
        [8, 'Period 9', 'Adams, Bennett', '5', 'Microbits Coding'],
        [8, 'Period 10', 'Adams, Bennett', '5', 'Microbits Coding']
      ];
      var today = now().date, d = today, schoolDays = [];
      var memo = {};
      while (schoolDays.length < 10) {
        d = Core.addDays(d, 1);
        var info = Core.dayInfo(d, data.settings, data.calendar, memo);
        if (!info.closed) schoolDays.push(d);
        if (d > Core.addDays(today, 60)) break;
      }
      var stamp = now().stamp;
      samples.forEach(function (s) {
        var date = schoolDays[s[0] - 1]; if (!date) return;
        data.bookings.push({ id: newId(), groupId: 'sample' + s[0] + s[2].length, created: stamp, email: 'sample@ddsb.ca',
          teachers: s[2], grades: s[3], space: data.settings.spaces[0], date: date, slot: s[1], description: s[4],
          status: 'active', token: 'sample', source: 'teacher', cancelledAt: '' });
      });
      mem = data; write();
      return data;
    }

    var store = {
      getSettings: function () { return JSON.parse(JSON.stringify(read().settings)); },
      saveSettings: function (s) { read().settings = s; write(); },
      getCalendar: function () { return JSON.parse(JSON.stringify(read().calendar)); },
      saveCalendar: function (c) { read().calendar = c; write(); },
      getStatics: function () { return JSON.parse(JSON.stringify(read().statics)); },
      saveStatics: function (s) { read().statics = s; write(); },
      getLibrarian: function () { return JSON.parse(JSON.stringify(read().librarian)); },
      saveLibrarian: function (l) { read().librarian = l; write(); },
      getBookings: function () { return JSON.parse(JSON.stringify(read().bookings)); },
      appendBookings: function (rows) { read().bookings = read().bookings.concat(JSON.parse(JSON.stringify(rows))); write(); },
      updateBookings: function (rows) {
        var all = read().bookings;
        rows.forEach(function (r) { for (var i = 0; i < all.length; i++) if (all[i].id === r.id) all[i] = JSON.parse(JSON.stringify(r)); });
        write();
      },
      checkPasscode: function (p) { return p === read().passcode; },
      setPasscode: function (p) { read().passcode = p; write(); },
      sendMail: function (to, subject, body) { if (window.console) console.info('[demo email] To: ' + to + '\n' + subject + '\n\n' + body); },
      newId: newId,
      withLock: function (fn) { return fn(); }
    };

    return {
      call: function (action, payload) {
        // Demo only: trust the email inside the sign-in token without checking it with Google.
        delete payload.authEmail;
        if (payload.idToken) {
          try {
            var claims = JSON.parse(decodeURIComponent(escape(atob(payload.idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
            payload.authEmail = payload.email = String(claims.email).toLowerCase();
          } catch (e) { /* ignore */ }
          delete payload.idToken;
        }
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            try { resolve(JSON.parse(JSON.stringify(Core.handle(action, payload, store, now())))); }
            catch (e) { reject(e); }
          }, 250);
        });
      },
      reset: function () { try { localStorage.removeItem(KEY); } catch (e) { } mem = null; }
    };
  })();

  return { call: call, demo: demo, resetDemo: Demo.reset, setIdToken: function (t) { idToken = t || null; } };
})();
