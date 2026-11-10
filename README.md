# Winchester P.S. Library Booking

A mobile-friendly website at **library.winchesterps.ca** where teachers can:

- see a week at a time, with each day's cycle day
- tap the open times they want
- fill in a short form to book them

Bookings are saved in the existing Google Sheet.

```
GitHub Pages (this repo)            Google Sheet + Apps Script
library.winchesterps.ca   ──────►   "App Bookings", "App Settings", … tabs
index.html  (teachers)              BookingApi.gs + BookingCore.gs
admin.html  (librarian)             (its own Apps Script project)
                                          │ also copies every booking into
                                          ▼
                                    "Form Responses 2" (old Form format)
                                    → weekly tabs, Today tab, Library Today
                                      and Home Assistant keep working
```

- **Teachers** use `index.html`. They pick times, enter their name(s), grade(s), activity and school email, and get an email confirmation with a cancel link.
- **The librarian** uses `admin.html`, which is protected by a passcode, to:
  - manage bookings
  - add recurring reservations
  - edit the school calendar and the "Where's Adams?" schedule
  - change rules such as how far ahead teachers can book
- **Data** lives in new tabs in your current Google Sheet, and every booking is also copied into **Form Responses 2** in the old Form's format. Your weekly tabs, the Today tab, Library Today and the Home Assistant feed all read from there, so they keep working without changes.

Until it's connected, the site runs in **demo mode**: bookings are saved only in your own browser, and the admin passcode is `changeme`. You can try everything before going live.

---

## Setup (about 20 minutes)

### 1. Create the booking backend (a separate Apps Script project)

The Sheet's existing Apps Script (Code.gs, App.html, Index.html, SchoolCalendarExport.gs) already has a `doGet()` for Library Today. A project can only have one `doGet()`, so the booking backend gets **its own project**. Your existing script and its deployments stay exactly as they are.

1. Make a backup of the Sheet first if you like (File → Make a copy).
2. Go to **[script.google.com](https://script.google.com) → New project**, signed in as the account that owns the Sheet. Rename the project *Library Booking API*.
3. Paste in the two code files:
   1. Rename the starting `Code.gs` file to `BookingApi`, then replace everything in it with [`apps-script/BookingApi.gs`](apps-script/BookingApi.gs).
   2. Click **+ → Script**, name the new file `BookingCore`, and paste in [`apps-script/BookingCore.gs`](apps-script/BookingCore.gs).
   - The Sheet's ID is already filled in at the top of `BookingApi.gs`.
4. Click the ⚙️ **Project Settings** gear and set the **Time zone** to *(GMT-05:00) Eastern Time – Toronto*.
5. Back in the editor, choose **`setup`** from the function menu at the top and click **Run**.
   - Google asks you to authorize the script. Choose your account → *Advanced* → *Go to project* → *Allow*.
   - This creates five new tabs: *App Bookings*, *App Settings*, *App Calendar*, *App Static Bookings* and *App Librarian Schedule*.
   - The calendar comes pre-filled with the 2026–27 DDSB dates. The librarian schedule comes pre-filled from the current timetable.
6. **Optional:** to bring over upcoming bookings from the old Google Form, choose **`importFormResponses`** and click **Run**.
   - Only bookings dated today or later are copied.
   - Run it once, just before you switch teachers over.
   - These bookings are already in Form Responses 2, so they aren't copied there a second time. Cancelling or editing one in the new admin page still updates its original row.
7. **Optional:** choose **`testEmail`** and click **Run**. This lets the script send email and sends you a test message.

### 2. Publish it as a web app

1. Click **Deploy → New deployment**, click the gear icon, and choose **Web app**.
2. Fill in the settings:
   - **Description:** Library booking
   - **Execute as:** Me
   - **Who has access:** **Anyone**
3. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

> **If "Anyone" isn't offered** (some school-board Google accounts only allow "Anyone within DDSB"), the website won't be able to reach the script. The fix is to copy the Google Sheet into a personal Google account, change `SPREADSHEET_ID` at the top of `BookingApi.gs` to the copy's ID, and do steps 1–2 from that account. Teachers never sign in to Google either way, so they won't notice a difference.

### 3. Connect the website

Open [`assets/config.js`](assets/config.js) and paste the URL between the quotes:

```js
window.LIBRARY_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfy…/exec'
};
```

### 4. Put the site on GitHub Pages

1. Create a new repository on GitHub, for example `winchester-library`. It can be public.
2. Upload every file in this folder: **Add file → Upload files**, then drag the files in.
3. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` and `/ (root)`.
4. Under **Custom domain**, enter `library.winchesterps.ca` and click **Save**. The `CNAME` file in this repo already contains that domain.

### 5. Point the domain at GitHub

Wherever `winchesterps.ca` is registered (GoDaddy, Namecheap, Google Domains/Squarespace, etc.), add this DNS record:

| Type  | Name / Host | Value / Points to          |
|-------|-------------|----------------------------|
| CNAME | `library`   | `YOUR-GITHUB-USERNAME.github.io` |

DNS can take anywhere from a few minutes to a few hours. When GitHub shows the domain as verified, tick **Enforce HTTPS** on the Pages settings screen.

### 6. First sign-in

1. Go to **library.winchesterps.ca/admin.html** and sign in with `changeme`.
2. Go to **Settings → Admin passcode** and change it right away.
3. Under **Settings → Emails**, add your email to get a copy of every booking and cancellation.
4. On the **School calendar** tab, check that the "Check:" line shows the right cycle days.

### 7. Switch teachers over

- On the Google Site, replace the embedded sheet and form with a link to (or an embed of) `https://library.winchesterps.ca`.
- In the Google Form, turn off **Accepting responses**. Set the closed message to *"Library booking has moved to library.winchesterps.ca"*.

---

## Everyday use (librarian)

| I want to… | Where |
|---|---|
| See, edit or cancel bookings, or cancel several at once | Admin → **Bookings** |
| Book for someone, including outside the normal booking window | Admin → **Bookings → Add a booking** |
| Block a time every Day 5, every Monday, or on one date | Admin → **Recurring** |
| Add a PA day or closure, or fix the cycle if the board shifts it | Admin → **School calendar** (use *Set cycle day*) |
| Update where the librarian is each period | Admin → **Librarian schedule** |
| Change how far ahead teachers can book, or add notice or limits | Admin → **Settings → Booking rules** |
| Pause online booking (e.g. during the book fair) | Admin → **Settings**: untick *Teachers can book online* |
| Show a message at the top of the booking page | Admin → **Settings → Announcement banner** |
| Rename or retime periods, or add a slot | Admin → **Settings → Time slots** |
| Add a second bookable space (e.g. Collaboration Space) | Admin → **Settings → Spaces** |
| Add or remove staff names | Admin → **Settings → Teachers and grades** |
| Get a full record or a spreadsheet export | The **App Bookings** tab in the Google Sheet |

**New school year:** On **School calendar**:

1. Update *First day of classes* and *Last day of school year*.
2. Delete last year's rows and add the new board dates.
3. Check that the "Check:" line shows the right cycle days.

## Changing the code later

- **Website files** (`index.html`, `assets/…`): edit them on GitHub and the site updates in about a minute.
- **Apps Script:** after editing, go to **Deploy → Manage deployments → ✏️ Edit**, set **Version: New version**, then click **Deploy**. The URL stays the same. If you skip this step, your changes won't go live.
- `assets/core.js` and `apps-script/BookingCore.gs` are **the same file**. They hold the booking rules and the cycle-day maths. If you change one, copy it over the other.

## Good to know

- **How the Form Responses 2 copy works:** each booking gets one row per date, with the same columns the Form used. Cancelling some of its times updates the *Period(s)* cell, and cancelling all of them deletes the row. To stop copying (for example, once you retire the weekly tabs), set `FORM_MIRROR_SHEET = ''` at the top of `BookingApi.gs` and deploy a new version.
- **Two copies of some lists:** the new site has its own recurring bookings and librarian schedule (admin → *Recurring* and *Librarian schedule*). Your weekly tabs and Library Today still use the old *Static Bookings* and *Simple Timetable* tabs. When a standing reservation or your timetable changes, update both places.
- **The Today tab (AppSheet):** `updateTodaySheet()` in your other script looks for today's date in cells C3:G3 of every visible tab. The new *App* tabs are full of dates, so add this line near the top of its loop, right after `var sheetName = sheet.getName();`:
  ```js
  if (sheetName.indexOf('App ') === 0) continue;   // skip the booking site's data tabs
  ```

- **Teacher identity:** teachers type their own email. Only `@ddsb.ca` addresses are accepted (you can change this in Settings), and there's no Google sign-in. Each booking gets a private cancel link, so teachers can only cancel their own bookings, from the same device or from their confirmation email. If you ever need stronger sign-in, Google Sign-In can be added later.
- **Double bookings:** the script locks while saving. If two teachers grab the same time at once, the second one is told it's taken.
- **Email limits:** Apps Script on a school account can send about 1,500 emails a day, and far fewer on a personal Gmail account (about 100 a day). Normal library use stays well under either limit.
- **What's public:** the `apps-script` folder here is just a copy of the code for reference, and it contains no passwords. The admin passcode is stored in the script's private properties, not in this repo.
