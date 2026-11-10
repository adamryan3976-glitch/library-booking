/*
 * apiUrl: paste your Apps Script Web app URL between the quotes (it ends in /exec).
 * Leave it empty to run the site in demo mode, which saves bookings only in
 * this browser — handy for trying things out.
 */
window.LIBRARY_CONFIG = {
  // Sign in with Google: paste your OAuth Client ID here (ends in
  // .apps.googleusercontent.com) and the same one into BookingApi.gs.
  // Leave it empty and teachers type their email instead.
  // With a Client ID set, the whole site needs a Google sign-in from this domain.
  googleHostedDomain: 'ddsb.ca',
  googleClientId: '241712157669-1huukafbcpsifc4v35op6o80qjb10r0r.apps.googleusercontent.com',

  apiUrl: 'https://script.google.com/macros/s/AKfycbwMxUBOyLMh_RrA4Ms0IAWpfH7-slFFPvg0SdK7XrAgt8pIBLLP6TIrcWTC1oV4AwjVPw/exec'
};
