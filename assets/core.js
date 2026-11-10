/*
 * Winchester P.S. Library Booking — shared booking rules.
 *
 * This exact file is used in two places:
 *   1. apps-script/BookingCore.gs   (the live backend in Apps Script)
 *   2. assets/core.js        (the browser, for cycle days and demo mode)
 * If you change one, copy it to the other so the rules stay identical.
 */
var Core = (function () {
  'use strict';

  // ---------- Defaults (used the first time the backend is set up) ----------

  var DEFAULT_SETTINGS = {
    schoolName: 'Winchester P.S.',
    siteTitle: 'Library Booking',
    siteUrl: 'https://library.winchesterps.ca',
    timezone: 'America/Toronto',
    yearStart: '2026-09-08',
    yearEnd: '2027-06-30',
    cycleLength: 5,
    slots: [
      { name: 'Before School', start: '07:45', end: '08:45', bookable: true },
      { name: 'Period 1', start: '08:45', end: '09:15', bookable: true },
      { name: 'Period 2', start: '09:15', end: '09:45', bookable: true },
      { name: 'Period 3', start: '09:45', end: '10:15', bookable: true },
      { name: 'AM Recess', start: '10:15', end: '10:30', bookable: true },
      { name: 'Period 4', start: '10:30', end: '11:00', bookable: true },
      { name: 'Period 5', start: '11:00', end: '11:30', bookable: true },
      { name: 'Lunch', start: '11:30', end: '12:30', bookable: true },
      { name: 'Period 6', start: '12:30', end: '13:00', bookable: true },
      { name: 'Period 7', start: '13:00', end: '13:30', bookable: true },
      { name: 'Period 8', start: '13:30', end: '14:00', bookable: true },
      { name: 'PM Recess', start: '14:00', end: '14:15', bookable: true },
      { name: 'Period 9', start: '14:15', end: '14:45', bookable: true },
      { name: 'Period 10', start: '14:45', end: '15:15', bookable: true },
      { name: 'After School', start: '15:15', end: '16:00', bookable: true }
    ],
    spaces: ['Library'],
    bookingsOpen: true,
    closedMessage: 'Online booking is paused right now. Please see the librarian.',
    windowDays: 21,
    minNoticeMinutes: 0,
    maxSlotsPerBooking: 10,
    maxSlotsPerWeek: 0,
    emailDomain: 'ddsb.ca',
    teachers: ['Adams', 'Appleton', 'Ayer', 'Basher', 'Beaton', 'Bennett', 'Bockhop', 'Cole', 'Connelly',
      'Daré', 'Dickhoff', 'Dodds', 'Dubyk', 'E. Wright', 'Henwood', 'Jovanovski', 'Kane', 'Kanellis',
      'Kennedy', 'Levac', 'Lundy', 'McMurtrie', 'McVeen', 'Moore', 'Murray', 'Pannunzio', 'Paquin',
      'Paulino', 'Pelton', 'S. Wright', 'Sheilds', 'Shepherd', 'Silverwood', 'Stuart', 'Tadeja-Letts', 'Whillans'],
    grades: ['FDK', '1', '2', '3', '4', '5', '6', '7', '8'],
    allowOtherTeacher: true,
    allowTeacherCancel: true,
    sendConfirmation: true,
    notifyEmail: '',
    announcement: '',
    showLibrarian: true,
    librarianLabel: "Where's Adams?",
    restrictToApproved: false
  };

  var DEFAULT_CALENDAR = [
    {"start": "2026-09-02", "end": "2026-09-02", "label": "PA Day", "type": "Closed"},
    {"start": "2026-09-03", "end": "2026-09-03", "label": "PA Day", "type": "Closed"},
    {"start": "2026-09-04", "end": "2026-09-04", "label": "Board Designated Holiday", "type": "Closed"},
    {"start": "2026-09-07", "end": "2026-09-07", "label": "Labour Day", "type": "Closed"},
    {"start": "2026-09-13", "end": "2026-09-14", "label": "Rosh Hashanah", "type": "Event"},
    {"start": "2026-09-21", "end": "2026-09-21", "label": "Yom Kippur", "type": "Event"},
    {"start": "2026-09-25", "end": "2026-09-25", "label": "Franco Ontarian Day", "type": "Event"},
    {"start": "2026-09-26", "end": "2026-10-02", "label": "Sukkot", "type": "Event"},
    {"start": "2026-09-30", "end": "2026-09-30", "label": "National Day for Truth and Reconciliation", "type": "Event"},
    {"start": "2026-09-30", "end": "2026-09-30", "label": "Orange Shirt Day", "type": "Event"},
    {"start": "2026-10-03", "end": "2026-10-03", "label": "Shemini Atzeret", "type": "Event"},
    {"start": "2026-10-04", "end": "2026-10-04", "label": "Simchat Torah", "type": "Event"},
    {"start": "2026-10-05", "end": "2026-10-05", "label": "World Teachers' Day", "type": "Event"},
    {"start": "2026-10-05", "end": "2026-10-09", "label": "Book Fair", "type": "Event"},
    {"start": "2026-10-10", "end": "2026-10-10", "label": "World Mental Health Day", "type": "Event"},
    {"start": "2026-10-11", "end": "2026-10-19", "label": "Navaratri", "type": "Event"},
    {"start": "2026-10-12", "end": "2026-10-12", "label": "Aga Khan’s Birthday", "type": "Event"},
    {"start": "2026-10-12", "end": "2026-10-12", "label": "Thanksgiving", "type": "Closed"},
    {"start": "2026-10-17", "end": "2026-10-21", "label": "Durga Puja", "type": "Event"},
    {"start": "2026-10-21", "end": "2026-10-28", "label": "Kanda Shasti", "type": "Event"},
    {"start": "2026-10-26", "end": "2026-10-26", "label": "PA Day", "type": "Closed"},
    {"start": "2026-10-31", "end": "2026-10-31", "label": "Halloween", "type": "Event"},
    {"start": "2026-11-01", "end": "2026-11-02", "label": "Dia de los Muertos", "type": "Event"},
    {"start": "2026-11-01", "end": "2026-11-07", "label": "Treaties Recognition Week", "type": "Event"},
    {"start": "2026-11-02", "end": "2026-11-06", "label": "Holocaust Education Week", "type": "Event"},
    {"start": "2026-11-06", "end": "2026-11-10", "label": "Diwali/Deepavali", "type": "Event"},
    {"start": "2026-11-08", "end": "2026-11-08", "label": "Bandi Chhor Divas", "type": "Event"},
    {"start": "2026-11-10", "end": "2026-11-10", "label": "Birth of the Bab begins", "type": "Event"},
    {"start": "2026-11-11", "end": "2026-11-11", "label": "Birth Of Bahá'u'lláh begins", "type": "Event"},
    {"start": "2026-11-11", "end": "2026-11-11", "label": "Remembrance Day", "type": "Event"},
    {"start": "2026-11-13", "end": "2026-11-13", "label": "PA Day", "type": "Closed"},
    {"start": "2026-11-13", "end": "2026-11-19", "label": "Transgender Awareness Week", "type": "Event"},
    {"start": "2026-11-16", "end": "2026-11-16", "label": "Louis Riel Day", "type": "Event"},
    {"start": "2026-11-16", "end": "2026-11-20", "label": "Anti-Bullying Awareness and Prevention Week", "type": "Event"},
    {"start": "2026-11-20", "end": "2026-11-20", "label": "Transgender Day of Remembrance", "type": "Event"},
    {"start": "2026-11-24", "end": "2026-11-24", "label": "Guru Nanak Jayanti", "type": "Event"},
    {"start": "2026-11-25", "end": "2026-11-25", "label": "Int’l Day for Elimination of Violence Against Women", "type": "Event"},
    {"start": "2026-11-26", "end": "2026-11-26", "label": "Day of the Covenant", "type": "Event"},
    {"start": "2026-11-28", "end": "2026-11-28", "label": "Ascension Of Abdu'l-Bahá¡ begins", "type": "Event"},
    {"start": "2026-11-28", "end": "2026-11-28", "label": "Holodomor Memorial Day", "type": "Event"},
    {"start": "2026-11-29", "end": "2026-11-29", "label": "First day of Advent", "type": "Event"},
    {"start": "2026-12-02", "end": "2026-12-02", "label": "International Day for the Abolition of Slavery", "type": "Event"},
    {"start": "2026-12-04", "end": "2026-12-12", "label": "Hanukkah", "type": "Event"},
    {"start": "2026-12-05", "end": "2026-12-05", "label": "International Volunteer Day", "type": "Event"},
    {"start": "2026-12-06", "end": "2026-12-06", "label": "National Day of Remembrance and Actions on Violence Against Women", "type": "Event"},
    {"start": "2026-12-08", "end": "2026-12-08", "label": "Bodhi Day", "type": "Event"},
    {"start": "2026-12-16", "end": "2026-12-24", "label": "Las Posadas", "type": "Event"},
    {"start": "2026-12-21", "end": "2026-12-21", "label": "Winter Solstice", "type": "Event"},
    {"start": "2026-12-21", "end": "2026-12-22", "label": "Shab-e Yalda", "type": "Event"},
    {"start": "2026-12-21", "end": "2027-01-01", "label": "Winter Break", "type": "Closed"},
    {"start": "2026-12-22", "end": "2026-12-22", "label": "Tohji-Taisai", "type": "Event"},
    {"start": "2026-12-25", "end": "2026-12-25", "label": "Christmas Day", "type": "Event"},
    {"start": "2026-12-26", "end": "2026-12-26", "label": "Boxing Day", "type": "Event"},
    {"start": "2026-12-26", "end": "2027-01-02", "label": "Kwanzaa", "type": "Event"},
    {"start": "2027-01-01", "end": "2027-01-01", "label": "New Years Day", "type": "Event"},
    {"start": "2027-01-06", "end": "2027-01-06", "label": "Epiphany", "type": "Event"},
    {"start": "2027-01-06", "end": "2027-01-06", "label": "Guru Gobind Singh’s Birthday", "type": "Event"},
    {"start": "2027-01-07", "end": "2027-01-07", "label": "Orthodox Christmas", "type": "Event"},
    {"start": "2027-01-14", "end": "2027-01-14", "label": "Orthodox New Year", "type": "Event"},
    {"start": "2027-01-15", "end": "2027-01-18", "label": "Thai Pongal", "type": "Event"},
    {"start": "2027-01-19", "end": "2027-01-19", "label": "Epiphany", "type": "Event"},
    {"start": "2027-01-21", "end": "2027-01-21", "label": "Lincoln Alexander Day", "type": "Event"},
    {"start": "2027-01-22", "end": "2027-01-22", "label": "PA Day", "type": "Closed"},
    {"start": "2027-01-27", "end": "2027-01-27", "label": "Int’l Holocaust Remembrance Day", "type": "Event"},
    {"start": "2027-01-29", "end": "2027-01-29", "label": "National Day of Remembrance of the Quebec City Mosque Attack and Action Against Islamophobia", "type": "Event"},
    {"start": "2027-02-01", "end": "2027-02-02", "label": "Imbolc", "type": "Event"},
    {"start": "2027-02-04", "end": "2027-02-11", "label": "Imamat Day", "type": "Event"},
    {"start": "2027-02-04", "end": "2027-02-12", "label": "Lunar New Year", "type": "Event"},
    {"start": "2027-02-08", "end": "2027-02-08", "label": "Start of Ramadan", "type": "Event"},
    {"start": "2027-02-09", "end": "2027-03-08", "label": "Ramadan", "type": "Event"},
    {"start": "2027-02-10", "end": "2027-02-10", "label": "Ash Wednesday", "type": "Event"},
    {"start": "2027-02-10", "end": "2027-03-25", "label": "Lent", "type": "Event"},
    {"start": "2027-02-11", "end": "2027-02-11", "label": "Women and Girls in Science", "type": "Event"},
    {"start": "2027-02-14", "end": "2027-02-14", "label": "Valentine’s Day", "type": "Event"},
    {"start": "2027-02-14", "end": "2027-02-20", "label": "Kindness Awareness Week", "type": "Event"},
    {"start": "2027-02-15", "end": "2027-02-15", "label": "Family Day", "type": "Closed"},
    {"start": "2027-02-15", "end": "2027-02-15", "label": "National Flag of Canada Day", "type": "Event"},
    {"start": "2027-02-21", "end": "2027-02-21", "label": "Mother Language Day", "type": "Event"},
    {"start": "2027-02-24", "end": "2027-02-24", "label": "Pink Shirt Day", "type": "Event"},
    {"start": "2027-03-05", "end": "2027-03-05", "label": "Laylat al Qadr", "type": "Event"},
    {"start": "2027-03-05", "end": "2027-03-05", "label": "Shivratri", "type": "Event"},
    {"start": "2027-03-08", "end": "2027-03-08", "label": "International Women’s Day", "type": "Event"},
    {"start": "2027-03-09", "end": "2027-03-10", "label": "Eid al-Fitr", "type": "Event"},
    {"start": "2027-03-15", "end": "2027-03-19", "label": "March Break", "type": "Closed"},
    {"start": "2027-03-17", "end": "2027-03-17", "label": "Irish Heritage Day", "type": "Event"},
    {"start": "2027-03-19", "end": "2027-03-19", "label": "Ugadi", "type": "Event"},
    {"start": "2027-03-20", "end": "2027-03-20", "label": "Earth Hour", "type": "Event"},
    {"start": "2027-03-20", "end": "2027-03-20", "label": "Nowruz", "type": "Event"},
    {"start": "2027-03-20", "end": "2027-03-20", "label": "Spring Equinox", "type": "Event"},
    {"start": "2027-03-21", "end": "2027-03-21", "label": "Holi", "type": "Event"},
    {"start": "2027-03-21", "end": "2027-03-21", "label": "Palm Sunday", "type": "Event"},
    {"start": "2027-03-21", "end": "2027-03-21", "label": "World Down Syndrome Day", "type": "Event"},
    {"start": "2027-03-23", "end": "2027-03-23", "label": "Purim", "type": "Event"},
    {"start": "2027-03-25", "end": "2027-03-25", "label": "Cerebral Palsy Awareness", "type": "Event"},
    {"start": "2027-03-26", "end": "2027-03-26", "label": "Good Friday", "type": "Closed"},
    {"start": "2027-03-26", "end": "2027-03-26", "label": "Purple Day for Epilepsy", "type": "Event"},
    {"start": "2027-03-28", "end": "2027-03-28", "label": "Easter Sunday", "type": "Event"},
    {"start": "2027-03-29", "end": "2027-03-29", "label": "Easter Monday", "type": "Closed"},
    {"start": "2027-03-31", "end": "2027-03-31", "label": "International Transgender Day of Visibility", "type": "Event"},
    {"start": "2027-03-31", "end": "2027-03-31", "label": "National Indigenous Languages Day", "type": "Event"},
    {"start": "2027-04-02", "end": "2027-04-02", "label": "World Autism Acceptance Day", "type": "Event"},
    {"start": "2027-04-09", "end": "2027-04-09", "label": "Vimy Ridge Day", "type": "Event"},
    {"start": "2027-04-13", "end": "2027-04-14", "label": "Tamil and Sinhala New Year", "type": "Event"},
    {"start": "2027-04-14", "end": "2027-04-14", "label": "Vaisakhi", "type": "Event"},
    {"start": "2027-04-21", "end": "2027-04-21", "label": "Administrative Professionals Day", "type": "Event"},
    {"start": "2027-04-21", "end": "2027-04-21", "label": "Earth Day", "type": "Event"},
    {"start": "2027-04-21", "end": "2027-04-21", "label": "First Day of Ridvan", "type": "Event"},
    {"start": "2027-04-22", "end": "2027-04-28", "label": "Passover/Pesach", "type": "Event"},
    {"start": "2027-04-22", "end": "2027-05-01", "label": "Ridvan", "type": "Event"},
    {"start": "2027-04-28", "end": "2027-04-28", "label": "National Day of Mourning", "type": "Event"},
    {"start": "2027-05-01", "end": "2027-05-01", "label": "National Principals’ Day", "type": "Event"},
    {"start": "2027-05-02", "end": "2027-05-02", "label": "Last Day of Ridvan", "type": "Event"},
    {"start": "2027-05-04", "end": "2027-05-04", "label": "Yom HaShoah-Holocaust Memorial Day", "type": "Event"},
    {"start": "2027-05-05", "end": "2027-05-05", "label": "Cinco De Mayo", "type": "Event"},
    {"start": "2027-05-05", "end": "2027-05-05", "label": "National Day of Awareness for Missing and Murdered Indigenous Women, Girls, and 2SLGBTQIA+ Peoples", "type": "Event"},
    {"start": "2027-05-14", "end": "2027-05-14", "label": "Day of Hajj", "type": "Event"},
    {"start": "2027-05-16", "end": "2027-05-16", "label": "Pentecost", "type": "Event"},
    {"start": "2027-05-16", "end": "2027-05-16", "label": "World Education Support Personnel Day", "type": "Event"},
    {"start": "2027-05-16", "end": "2027-05-20", "label": "Eid-al-Adha", "type": "Event"},
    {"start": "2027-05-17", "end": "2027-05-17", "label": "International Day Against Homophobia, Transphobia, Biphobia", "type": "Event"},
    {"start": "2027-05-17", "end": "2027-05-18", "label": "Day of Hajj", "type": "Event"},
    {"start": "2027-05-20", "end": "2027-05-20", "label": "Vesak", "type": "Event"},
    {"start": "2027-05-24", "end": "2027-05-24", "label": "Victoria Day", "type": "Closed"},
    {"start": "2027-05-29", "end": "2027-05-29", "label": "Ascension of Bahá'u'lláh", "type": "Event"},
    {"start": "2027-06-01", "end": "2027-06-01", "label": "Ontario Day", "type": "Event"},
    {"start": "2027-06-02", "end": "2027-07-02", "label": "Red Shirt Day", "type": "Event"},
    {"start": "2027-06-04", "end": "2027-06-04", "label": "PA Day", "type": "Closed"},
    {"start": "2027-06-30", "end": "2027-06-30", "label": "PA Day", "type": "Closed"},
    {"start": "2027-07-05", "end": "2027-07-06", "label": "Hijra", "type": "Event"},
    {"start": "2027-07-11", "end": "2027-07-12", "label": "Shavuot", "type": "Event"},
    {"start": "2027-07-14", "end": "2027-07-15", "label": "Ashura", "type": "Event"},
    {"start": "2027-07-16", "end": "2027-07-16", "label": "Martyrdom of Guru Arjan Dev", "type": "Event"},
    {"start": "2027-07-18", "end": "2027-07-18", "label": "Autistic Pride Day", "type": "Event"},
    {"start": "2027-07-19", "end": "2027-07-19", "label": "Juneteenth", "type": "Event"},
    {"start": "2027-07-20", "end": "2027-07-20", "label": "Litha", "type": "Event"},
    {"start": "2027-07-21", "end": "2027-07-21", "label": "National Indigenous People's Day", "type": "Event"},
    {"start": "2027-07-21", "end": "2027-07-21", "label": "Summer Solstice", "type": "Event"},
    {"start": "2027-07-29", "end": "2027-07-30", "label": "Gahambar Maidyoshem", "type": "Event"}
  ];

  var DEFAULT_STATICS = [
    { id: 'st-dubyk', repeat: 'cycle', days: [5], slots: ['Period 9'], space: '', label: 'Dubyk 102 - Book Exchange', start: '', end: '' }
  ];

  // Librarian location by cycle day (index 0 = Day 1). Blank = not shown.
  var L = 'Library';
  var DEFAULT_LIBRARIAN = {
    'Before School': ['Crosswalk Duty', 'Crosswalk Duty', 'Crosswalk Duty', 'Crosswalk Duty', 'Crosswalk Duty'],
    'Period 1': ['PREP', 'PREP', 'PREP', 'PREP', 'PREP'],
    'Period 2': ['Kanellis FDK Room 111', L, 'Kanellis FDK Room 111', L, L],
    'Period 3': ['Kanellis FDK Room 111', L, 'Kanellis FDK Room 111', 'Shepherd FDK Room 101', 'Shepherd FDK Room 101'],
    'AM Recess': [L, L, L, L, L],
    'Period 4': ['Murray FDK Room 103', L, 'Library with E. Wright', 'Kanellis FDK Room 111 and Book Exchange in Library', 'Kanellis FDK Room 111'],
    'Period 5': [L, L, L, 'Kanellis FDK Room 111 and Book Exchange in Library', 'Kanellis FDK Room 111'],
    'Lunch': [L, L, L, L, L],
    'Period 6': [L, L, L, L, L],
    'Period 7': [L, L, L, L, L],
    'Period 8': [L, L, L, L, L],
    'PM Recess': [L, L, L, L, L],
    'Period 9': [L, L, L, L, L],
    'Period 10': [L, L, L, L, L],
    'After School': [L, L, L, L, L]
  };

  // ---------- Date helpers (all dates are 'YYYY-MM-DD' strings) ----------

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toDate(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fromDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { var d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fromDate(d); }
  function weekday(s) { return toDate(s).getUTCDay(); } // 0 Sun .. 6 Sat
  function isWeekend(s) { var w = weekday(s); return w === 0 || w === 6; }
  function mondayOf(s) { var w = weekday(s); return addDays(s, w === 0 ? 1 : (w === 6 ? 2 : 1 - w)); }
  function toMinutes(hhmm) { var p = String(hhmm || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function isDateStr(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function fmtTime(hhmm) {
    var m = toMinutes(hhmm), h = Math.floor(m / 60), mm = m % 60;
    return ((h + 11) % 12 + 1) + ':' + pad(mm);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function fmtDateLong(s) { var d = toDate(s); return DAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
  function fmtDateShort(s) { var d = toDate(s); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); }

  // ---------- Calendar / cycle days ----------

  function calendarOn(date, calendar) {
    var out = [];
    for (var i = 0; i < calendar.length; i++) {
      var c = calendar[i];
      var end = c.end || c.start;
      if (c.start && date >= c.start && date <= end) out.push(c);
    }
    return out;
  }

  function isClosed(date, settings, calendar) {
    if (isWeekend(date)) return true;
    if (date < settings.yearStart || date > settings.yearEnd) return true;
    var on = calendarOn(date, calendar);
    for (var i = 0; i < on.length; i++) if (on[i].type === 'Closed') return true;
    return false;
  }

  /**
   * Info for one date: { date, closed, closedLabel, cycleDay, events: [labels] }
   * The cycle counts school days from yearStart (Day 1). A calendar row with
   * setDay restarts the count on its start date (e.g. "Set Day 3").
   */
  function dayInfo(date, settings, calendar, memo) {
    memo = memo || {};
    if (memo[date]) return memo[date];
    var on = calendarOn(date, calendar);
    var info = { date: date, closed: false, closedLabel: '', cycleDay: null, events: [] };
    for (var i = 0; i < on.length; i++) {
      if (on[i].type === 'Closed') { info.closed = true; info.closedLabel = info.closedLabel || on[i].label; }
      else if (on[i].label) info.events.push(on[i].label);
    }
    if (isWeekend(date)) { info.closed = true; info.closedLabel = 'Weekend'; }
    else if (date < settings.yearStart || date > settings.yearEnd) { info.closed = true; info.closedLabel = info.closedLabel || 'No school'; }
    if (!info.closed) {
      var anchorDate = settings.yearStart, anchorDay = 1;
      for (var j = 0; j < calendar.length; j++) {
        var c = calendar[j], sd = parseInt(c.setDay, 10);
        if (sd && c.start && c.start <= date && c.start > anchorDate) { anchorDate = c.start; anchorDay = sd; }
      }
      var count = 0, d = anchorDate, len = parseInt(settings.cycleLength, 10) || 5;
      while (d < date) { if (!isClosed(d, settings, calendar)) count++; d = addDays(d, 1); }
      info.cycleDay = ((anchorDay - 1 + count) % len) + 1;
    }
    memo[date] = info;
    return info;
  }

  function staticsFor(date, cycleDay, statics) {
    var out = [];
    if (cycleDay == null) return out;
    var wd = weekday(date);
    for (var i = 0; i < statics.length; i++) {
      var s = statics[i];
      if (s.start && date < s.start) continue;
      if (s.end && date > s.end) continue;
      var days = s.days || [];
      var hit = false;
      if (s.repeat === 'weekday') hit = days.indexOf(wd) >= 0;
      else if (s.repeat === 'date') hit = !!s.start && date === s.start;
      else hit = days.indexOf(cycleDay) >= 0;
      if (hit) out.push(s);
    }
    return out;
  }

  function bookingLabel(b) {
    var parts = [b.teachers];
    if (b.grades) parts.push('Grade(s) ' + b.grades);
    if (b.description) parts.push(b.description);
    return parts.join(' - ');
  }

  // ---------- Request handling ----------

  function publicSettings(s) {
    var copy = JSON.parse(JSON.stringify(s));
    delete copy.notifyEmail;
    return copy;
  }

  function publicBooking(b) {
    return { id: b.id, groupId: b.groupId, date: b.date, slot: b.slot, space: b.space,
      teachers: b.teachers, grades: b.grades, description: b.description, label: bookingLabel(b) };
  }

  function adminBooking(b) {
    var p = publicBooking(b);
    p.email = b.email; p.created = b.created; p.status = b.status; p.source = b.source; p.cancelledAt = b.cancelledAt || '';
    return p;
  }

  function err(msg) { var e = new Error(msg); e.userFacing = true; return e; }

  function cleanList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean);
    return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /**
   * Check a set of requested slots. Returns nothing; throws a user-facing error.
   * opts.admin skips the booking window, notice, open/closed and weekly-limit rules.
   */
  function validateItems(items, email, ctx, opts) {
    var s = ctx.settings, now = ctx.now, memo = {};
    if (!items || !items.length) throw err('Choose at least one time slot.');
    if (!opts.admin) {
      if (!s.bookingsOpen) throw err(s.closedMessage || 'Online booking is closed.');
      if (s.maxSlotsPerBooking && !opts.skipPerBookingMax && items.length > s.maxSlotsPerBooking)
        throw err('You can book up to ' + s.maxSlotsPerBooking + ' slots at a time.');
    }
    var slotByName = {};
    s.slots.forEach(function (sl) { slotByName[sl.name] = sl; });
    var active = ctx.bookings.filter(function (b) { return b.status === 'active'; });
    var taken = {};
    active.forEach(function (b) { taken[b.date + '|' + b.slot + '|' + b.space] = b; });
    var seen = {};
    var lastDay = addDays(now.date, parseInt(s.windowDays, 10) || 0);

    items.forEach(function (it) {
      var name = it.slot + ' on ' + (isDateStr(it.date) ? fmtDateLong(it.date) : it.date);
      if (!isDateStr(it.date)) throw err('A booking date is missing or invalid.');
      var sl = slotByName[it.slot];
      if (!sl) throw err(it.slot + ' is not a bookable time.');
      if (s.spaces.indexOf(it.space) < 0) throw err('"' + it.space + '" is not a bookable space.');
      var key = it.date + '|' + it.slot + '|' + it.space;
      if (seen[key]) throw err(name + ' was selected twice.');
      seen[key] = true;
      var info = dayInfo(it.date, s, ctx.calendar, memo);
      if (info.closed) throw err('The library cannot be booked on ' + fmtDateLong(it.date) + (info.closedLabel ? ' (' + info.closedLabel + ')' : '') + '.');
      if (!opts.admin) {
        if (!sl.bookable) throw err(it.slot + ' is not open for booking.');
        if (it.date < now.date) throw err(name + ' has already passed.');
        if (it.date === now.date && toMinutes(sl.start) - (parseInt(s.minNoticeMinutes, 10) || 0) <= now.minutes)
          throw err(name + ' has started or is too soon to book online.');
        if (it.date > lastDay)
          throw err(name + ' is more than ' + s.windowDays + ' days ahead. Bookings open on ' + fmtDateLong(addDays(it.date, -s.windowDays)) + '.');
      }
      if (taken[key]) throw err(name + ' is already booked by ' + taken[key].teachers + '. Pick another slot.');
      var st = staticsFor(it.date, info.cycleDay, ctx.statics).filter(function (x) {
        return x.slots.indexOf(it.slot) >= 0 && (!x.space || x.space === it.space);
      });
      if (st.length) throw err(name + ' is reserved for ' + st[0].label + '.');
    });

    if (!opts.admin && s.maxSlotsPerWeek && email) {
      var perWeek = {};
      active.forEach(function (b) {
        if (b.email && b.email.toLowerCase() === email.toLowerCase()) {
          var wk = mondayOf(b.date); perWeek[wk] = (perWeek[wk] || 0) + 1;
        }
      });
      items.forEach(function (it) {
        var wk = mondayOf(it.date); perWeek[wk] = (perWeek[wk] || 0) + 1;
        if (perWeek[wk] > s.maxSlotsPerWeek)
          throw err('You can book up to ' + s.maxSlotsPerWeek + ' slots per week (week of ' + fmtDateShort(wk) + ').');
      });
    }
  }

  function randomToken(store) { return store.newId() + store.newId(); }

  function summaryText(rows) {
    return rows.map(function (b) { return '• ' + fmtDateLong(b.date) + ' — ' + b.slot + (b.space ? ' (' + b.space + ')' : ''); }).join('\n');
  }

  function cleanDetails(p) {
    var teachers = cleanList(p.teachers);
    if (!teachers.length) throw err('Add at least one teacher name.');
    var description = String(p.description || '').trim();
    if (!description) throw err('Add a short description of the activity.');
    if (description.length > 300) throw err('Keep the description under 300 characters.');
    return { teachers: teachers.join(', '), grades: cleanList(p.grades).join(', '), description: description };
  }

  function cleanItems(list, s) {
    return (list || []).map(function (it) {
      return { date: String(it.date || ''), slot: String(it.slot || ''), space: String(it.space || s.spaces[0]) };
    });
  }

  function sortRows(rows, s) {
    return rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : slotIndex(s, a.slot) - slotIndex(s, b.slot); });
  }

  /** May this request change the group? A matching private token or a signed-in email that made the booking. */
  function canManage(rows, p) {
    if (!rows.length) return false;
    if (p.token && rows[0].token === p.token) return true;
    return !!(p.authEmail && rows[0].email && rows[0].email.toLowerCase() === String(p.authEmail).toLowerCase());
  }

  function createBooking(p, store, ctx, opts) {
    var s = ctx.settings;
    var email = String(p.authEmail || p.email || '').trim().toLowerCase();
    if (!opts.admin) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('Enter your school email address.');
      if (s.emailDomain && email.slice(-(s.emailDomain.length + 1)) !== '@' + s.emailDomain.toLowerCase())
        throw err('Use your @' + s.emailDomain + ' email address.');
    }
    var det = cleanDetails(p);
    var items = cleanItems(p.items, s);
    validateItems(items, email, ctx, opts);

    var groupId = store.newId(), token = randomToken(store), created = ctx.now.stamp;
    var rows = items.map(function (it) {
      return { id: store.newId(), groupId: groupId, created: created, email: email, teachers: det.teachers,
        grades: det.grades, space: it.space, date: it.date, slot: it.slot, description: det.description,
        status: 'active', token: token, source: opts.admin ? 'admin' : 'teacher', cancelledAt: '' };
    });
    sortRows(rows, s);
    store.appendBookings(rows);

    var label = bookingLabel(rows[0]);
    var cancelUrl = (s.siteUrl || '') + '/?booking=' + groupId + '&token=' + token;
    if (s.sendConfirmation && email && !opts.admin) {
      safeMail(store, email, 'Library booked: ' + label,
        'Your library booking is confirmed.\n\n' + label + '\n' + summaryText(rows) +
        (s.allowTeacherCancel ? '\n\nNeed to change or cancel it? Open this link:\n' + cancelUrl : '') +
        '\n\n— ' + s.schoolName + ' Library');
    }
    if (s.notifyEmail) {
      safeMail(store, s.notifyEmail, 'New library booking: ' + label,
        label + '\nBooked by ' + (email || 'admin') + '\n\n' + summaryText(rows));
    }
    return { groupId: groupId, token: token, bookings: rows.map(publicBooking) };
  }

  /**
   * Teacher edit: change details, drop some times and/or add new ones, in one step.
   * p: { groupId, token|authEmail, teachers, grades, description, removeIds: [], addItems: [] }
   */
  function updateBooking(p, store, ctx) {
    var s = ctx.settings, now = ctx.now;
    if (!s.allowTeacherCancel) throw err('Please ask the librarian to change this booking.');
    var all = ctx.bookings;
    var rows = all.filter(function (b) { return b.groupId === p.groupId && b.status === 'active'; });
    if (!rows.length) throw err('This booking was already cancelled, or the link is not valid.');
    if (!canManage(rows, p)) throw err('You can only change bookings you made.');
    var det = cleanDetails(p);
    var removeIds = p.removeIds || [];
    var removing = rows.filter(function (b) { return removeIds.indexOf(b.id) >= 0; });
    removing.forEach(function (b) { if (b.date < now.date) throw err('Times that have already passed can’t be removed.'); });
    var keeping = rows.filter(function (b) { return removeIds.indexOf(b.id) < 0; });
    var addItems = cleanItems(p.addItems, s);
    if (addItems.length) {
      // Check new times against everyone else's bookings, ignoring the times being removed from this one.
      var others = all.filter(function (b) { return removing.indexOf(b) < 0; });
      var max = s.maxSlotsPerBooking;
      if (max && keeping.length + addItems.length > max) throw err('A booking can have up to ' + max + ' times.');
      validateItems(addItems, rows[0].email, { settings: s, calendar: ctx.calendar, statics: ctx.statics, bookings: others, now: now },
        { skipPerBookingMax: true });
    }
    var first = rows[0];
    var changed = [];
    keeping.forEach(function (b) {
      if (b.teachers !== det.teachers || b.grades !== det.grades || b.description !== det.description) {
        b.teachers = det.teachers; b.grades = det.grades; b.description = det.description; changed.push(b);
      }
    });
    removing.forEach(function (b) { b.status = 'cancelled'; b.cancelledAt = now.stamp; changed.push(b); });
    var added = addItems.map(function (it) {
      return { id: store.newId(), groupId: first.groupId, created: first.created, email: first.email, teachers: det.teachers,
        grades: det.grades, space: it.space, date: it.date, slot: it.slot, description: det.description,
        status: 'active', token: first.token, source: first.source, cancelledAt: '' };
    });
    if (changed.length) store.updateBookings(changed);
    if (added.length) store.appendBookings(added);
    var active = sortRows(keeping.concat(added), s);
    if (active.length || removing.length || added.length) {
      var label = active.length ? bookingLabel(active[0]) : bookingLabel(first);
      var body = (active.length ? label + '\n' + summaryText(active) : 'All times were removed, so this booking is cancelled.');
      if (s.sendConfirmation && first.email) safeMail(store, first.email, 'Library booking updated: ' + label,
        'Your library booking was updated.\n\n' + body + '\n\n— ' + s.schoolName + ' Library');
      if (s.notifyEmail) safeMail(store, s.notifyEmail, 'Library booking changed: ' + label,
        body + '\nChanged by ' + (p.authEmail || first.email || 'teacher') +
        (removing.length ? '\n\nRemoved:\n' + summaryText(removing) : '') + (added.length ? '\n\nAdded:\n' + summaryText(added) : ''));
    }
    return { bookings: active.map(publicBooking) };
  }

  function safeMail(store, to, subject, body) {
    try { store.sendMail(to, subject, body); } catch (e) { /* email failure shouldn't block a booking */ }
  }

  function slotIndex(s, name) {
    for (var i = 0; i < s.slots.length; i++) if (s.slots[i].name === name) return i;
    return 999;
  }

  function inRange(b, from, to) { return (!from || b.date >= from) && (!to || b.date <= to); }

  function cancelRows(rows, store, ctx, by) {
    if (!rows.length) throw err('This booking was already cancelled, or the cancel link is not valid.');
    rows.forEach(function (b) { b.status = 'cancelled'; b.cancelledAt = ctx.now.stamp; });
    store.updateBookings(rows);
    var s = ctx.settings;
    if (s.notifyEmail) {
      safeMail(store, s.notifyEmail, 'Library booking cancelled: ' + bookingLabel(rows[0]),
        bookingLabel(rows[0]) + '\nCancelled by ' + by + '\n\n' + summaryText(rows));
    }
    return { cancelled: rows.map(function (b) { return b.id; }) };
  }

  function checkAdmin(p, store) {
    if (!store.checkPasscode(String(p.passcode || ''))) throw err('That passcode is not correct.');
  }

  var SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

  function sanitizeSettings(input, current) {
    var out = JSON.parse(JSON.stringify(current));
    SETTING_KEYS.forEach(function (k) { if (input.hasOwnProperty(k)) out[k] = input[k]; });
    ['windowDays', 'minNoticeMinutes', 'maxSlotsPerBooking', 'maxSlotsPerWeek', 'cycleLength'].forEach(function (k) {
      out[k] = Math.max(0, parseInt(out[k], 10) || 0);
    });
    if (out.cycleLength < 1) out.cycleLength = 5;
    out.spaces = cleanList(out.spaces); if (!out.spaces.length) out.spaces = ['Library'];
    out.teachers = cleanList(out.teachers);
    out.grades = cleanList(out.grades);
    out.slots = (out.slots || []).filter(function (x) { return x && x.name; }).map(function (x) {
      return { name: String(x.name).trim(), start: String(x.start || '00:00'), end: String(x.end || '00:00'), bookable: x.bookable !== false };
    });
    if (!isDateStr(out.yearStart) || !isDateStr(out.yearEnd)) throw err('School year start and end must be dates.');
    out.emailDomain = String(out.emailDomain || '').replace(/^@/, '').trim();
    return out;
  }

  // ---------- Approved staff ----------
  // Staff record: { email, name, status: 'approved'|'pending'|'denied', requested, decided, note }

  function findStaff(list, email) {
    email = String(email || '').toLowerCase();
    for (var i = 0; i < list.length; i++) if (list[i].email === email) return list[i];
    return null;
  }

  function accessErr(status) {
    var msgs = {
      none: 'You’re not on the library’s staff list yet. Request access and the librarian will review it.',
      pending: 'Your access request is waiting for the librarian’s approval.',
      denied: 'Your access request wasn’t approved. Please speak to the librarian.'
    };
    var e = err(msgs[status] || msgs.none); e.access = status || 'none'; return e;
  }

  function cleanEmail(v, s) {
    var email = String(v || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('“' + v + '” isn’t an email address.');
    if (s.emailDomain && email.slice(-(s.emailDomain.length + 1)) !== '@' + s.emailDomain.toLowerCase())
      throw err(email + ' isn’t an @' + s.emailDomain + ' address.');
    return email;
  }

  function sortStaff(list) {
    return list.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  }

  /** Main entry point. Returns a plain object; throws user-facing errors. */
  function handle(action, p, store, now) {
    p = p || {};
    var ctx = {
      settings: store.getSettings(), calendar: store.getCalendar(), statics: store.getStatics(),
      bookings: null, now: now
    };
    function loadBookings() { ctx.bookings = store.getBookings(); return ctx.bookings; }

    // Only staff on the approved list may use the teacher side (needs a verified sign-in to know who it is).
    var isAdminAction = String(action).indexOf('admin') === 0;
    var me = null;
    if (p.authEmail && !isAdminAction) {
      me = findStaff(store.getStaff(), p.authEmail);
      if (ctx.settings.restrictToApproved && action !== 'requestAccess' && (!me || me.status !== 'approved')) {
        throw accessErr(me ? me.status : 'none');
      }
    }

    switch (action) {
      case 'init':
        return { settings: publicSettings(ctx.settings), calendar: ctx.calendar, statics: ctx.statics,
          librarian: store.getLibrarian(), today: now.date, nowMinutes: now.minutes,
          me: p.authEmail ? { email: p.authEmail, name: me && me.status === 'approved' ? me.name : '' } : null };

      case 'requestAccess':
        return store.withLock(function () {
          if (!p.authEmail) throw err('Sign in with your school Google account first.');
          var list = store.getStaff();
          var rec = findStaff(list, p.authEmail);
          if (rec && rec.status === 'approved') return { access: 'approved' };
          if (rec && rec.status === 'denied') throw accessErr('denied');
          var name = String(p.name || '').trim();
          if (!name) throw err('Add your name so the librarian knows who you are.');
          var note = String(p.note || '').trim().slice(0, 200);
          if (!rec) { rec = { email: String(p.authEmail).toLowerCase() }; list.push(rec); }
          rec.name = name; rec.status = 'pending'; rec.requested = now.stamp; rec.decided = ''; rec.note = note;
          store.saveStaff(list);
          if (ctx.settings.notifyEmail) {
            safeMail(store, ctx.settings.notifyEmail, 'Library access request: ' + name,
              name + ' (' + rec.email + ') asked to use library booking.' + (note ? '\n\nNote: ' + note : '') +
              '\n\nApprove or deny it on the admin page:\n' + (ctx.settings.siteUrl || '') + '/admin.html');
          }
          return { access: 'pending' };
        });

      case 'bookings':
        return { bookings: loadBookings().filter(function (b) {
          return b.status === 'active' && inRange(b, p.from, p.to);
        }).map(publicBooking) };

      case 'book':
        return store.withLock(function () { loadBookings(); return createBooking(p, store, ctx, {}); });

      case 'mine': {
        var keys = {};
        (p.groups || []).forEach(function (g) { keys[g.groupId] = g.token; });
        var me = String(p.authEmail || '').toLowerCase();
        return { bookings: loadBookings().filter(function (b) {
          if (b.status !== 'active' || b.date < now.date) return false;
          return (keys[b.groupId] && keys[b.groupId] === b.token) || (me && b.email && b.email.toLowerCase() === me);
        }).map(publicBooking) };
      }

      case 'cancel':
        return store.withLock(function () {
          if (!ctx.settings.allowTeacherCancel) throw err('Please ask the librarian to cancel this booking.');
          var group = loadBookings().filter(function (b) { return b.groupId === p.groupId && b.status === 'active'; });
          if (!canManage(group, p)) group = [];
          var rows = group.filter(function (b) { return !p.ids || !p.ids.length || p.ids.indexOf(b.id) >= 0; });
          return cancelRows(rows, store, ctx, rows.length ? rows[0].email : '');
        });

      case 'update':
        return store.withLock(function () { loadBookings(); return updateBooking(p, store, ctx); });

      // ----- Admin -----
      case 'adminLogin':
        checkAdmin(p, store);
        return { settings: ctx.settings };

      case 'adminBookings':
        checkAdmin(p, store);
        return { bookings: loadBookings().filter(function (b) {
          return (p.includeCancelled || b.status === 'active') && inRange(b, p.from, p.to);
        }).map(adminBooking) };

      case 'adminBook':
        checkAdmin(p, store);
        return store.withLock(function () { loadBookings(); return createBooking(p, store, ctx, { admin: true }); });

      case 'adminCancel':
        checkAdmin(p, store);
        return store.withLock(function () {
          var ids = p.ids || [];
          var rows = loadBookings().filter(function (b) { return b.status === 'active' && ids.indexOf(b.id) >= 0; });
          return cancelRows(rows, store, ctx, 'the librarian');
        });

      case 'adminUpdate':
        checkAdmin(p, store);
        return store.withLock(function () {
          var rows = loadBookings().filter(function (b) { return b.id === p.id || (p.groupId && b.groupId === p.groupId); });
          if (!rows.length) throw err('That booking no longer exists.');
          rows.forEach(function (b) {
            if (p.teachers != null) b.teachers = cleanList(p.teachers).join(', ');
            if (p.grades != null) b.grades = cleanList(p.grades).join(', ');
            if (p.description != null) b.description = String(p.description).trim();
          });
          store.updateBookings(rows);
          return { bookings: rows.map(adminBooking) };
        });

      case 'adminSaveSettings':
        checkAdmin(p, store);
        var next = sanitizeSettings(p.settings || {}, ctx.settings);
        store.saveSettings(next);
        return { settings: next };

      case 'adminSaveCalendar':
        checkAdmin(p, store);
        var cal = (p.calendar || []).filter(function (c) { return isDateStr(c.start); }).map(function (c) {
          return { start: c.start, end: isDateStr(c.end) && c.end >= c.start ? c.end : c.start,
            label: String(c.label || '').trim(), type: c.type === 'Closed' ? 'Closed' : 'Event',
            setDay: parseInt(c.setDay, 10) || '' };
        });
        cal.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
        store.saveCalendar(cal);
        return { calendar: cal };

      case 'adminSaveStatics':
        checkAdmin(p, store);
        var st = (p.statics || []).filter(function (x) { return x.label && x.slots && x.slots.length; }).map(function (x) {
          return { id: x.id || store.newId(), repeat: ['cycle', 'weekday', 'date'].indexOf(x.repeat) >= 0 ? x.repeat : 'cycle',
            days: (x.days || []).map(function (d) { return parseInt(d, 10); }).filter(function (d) { return d >= 0; }),
            slots: cleanList(x.slots), space: String(x.space || ''), label: String(x.label).trim(),
            start: isDateStr(x.start) ? x.start : '', end: isDateStr(x.end) ? x.end : '' };
        });
        store.saveStatics(st);
        return { statics: st };

      case 'adminSaveLibrarian':
        checkAdmin(p, store);
        store.saveLibrarian(p.librarian || {});
        return { librarian: p.librarian || {} };

      case 'adminStaff':
        checkAdmin(p, store);
        return { staff: sortStaff(store.getStaff()) };

      case 'adminStaffAdd':
        checkAdmin(p, store);
        return store.withLock(function () {
          var list = store.getStaff(), added = 0, s = ctx.settings;
          var entries = (p.entries || []).map(function (en) {
            var name = String(en.name || '').trim();
            if (!name) throw err('Every staff member needs a name (' + (en.email || 'no email') + ').');
            return { name: name, email: cleanEmail(en.email, s) };
          });
          if (!entries.length) throw err('Add at least one name and email.');
          entries.forEach(function (en) {
            var rec = findStaff(list, en.email);
            if (!rec) { rec = { email: en.email, requested: '', note: '' }; list.push(rec); added++; }
            rec.name = en.name; rec.status = 'approved'; rec.decided = now.stamp;
          });
          store.saveStaff(list);
          return { staff: sortStaff(list), added: added, updated: entries.length - added };
        });

      case 'adminStaffDecide':
        checkAdmin(p, store);
        return store.withLock(function () {
          var list = store.getStaff(), s = ctx.settings;
          var rec = findStaff(list, p.email);
          if (!rec) throw err('That person isn’t on the list any more.');
          if (p.decision === 'remove') {
            list.splice(list.indexOf(rec), 1);
          } else if (p.decision === 'approved' || p.decision === 'denied') {
            var wasApproved = rec.status === 'approved';
            rec.status = p.decision; rec.decided = now.stamp;
            if (p.name != null && String(p.name).trim()) rec.name = String(p.name).trim();
            if (p.decision === 'approved' && !wasApproved) {
              safeMail(store, rec.email, 'You can now book the library',
                'Hi ' + rec.name + ',\n\nYou now have access to library booking. Sign in with your school Google account here:\n' +
                (s.siteUrl || '') + '\n\n— ' + s.schoolName + ' Library');
            }
          } else throw err('Unknown decision.');
          store.saveStaff(list);
          return { staff: sortStaff(list) };
        });

      case 'adminSetPasscode':
        checkAdmin(p, store);
        if (String(p.newPasscode || '').length < 6) throw err('Use at least 6 characters for the passcode.');
        store.setPasscode(String(p.newPasscode));
        return { ok: true };

      default:
        throw err('Unknown request.');
    }
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_CALENDAR: DEFAULT_CALENDAR,
    DEFAULT_STATICS: DEFAULT_STATICS, DEFAULT_LIBRARIAN: DEFAULT_LIBRARIAN,
    handle: handle, findStaff: findStaff, dayInfo: dayInfo, staticsFor: staticsFor, bookingLabel: bookingLabel,
    addDays: addDays, mondayOf: mondayOf, weekday: weekday, toMinutes: toMinutes, fmtTime: fmtTime,
    fmtDateLong: fmtDateLong, fmtDateShort: fmtDateShort, isDateStr: isDateStr, slotIndex: slotIndex,
    MONTHS: MONTHS, DAYS: DAYS
  };
})();

if (typeof module !== 'undefined') module.exports = Core;
