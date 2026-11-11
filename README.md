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

- **Teachers** use `index.html`. They pick times, enter their name(s), grade(s) and activity, and get an email confirmation. From **My bookings** they can change a booking (details, drop times, add times) or cancel it. With Google sign-in turned on (see below), their email comes from their school Google account and My bookings works on any device.
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
   - Only bookings dated today or later are copied, and each Form booking is only ever copied once, so it's safe to run again.
   - These bookings are already in Form Responses 2, so they aren't copied there a second time. Cancelling or editing one in the app still updates its original row.
   - To keep copying new Form bookings automatically while both systems are in use, see *Running the Form and the app side by side* below.
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

### 7. Optional: turn on "Sign in with Google"

Without this, anyone with the link can see the calendar, and teachers type their email and manage bookings from the device they booked on (or the link in their confirmation email). With it, **the whole site is locked until a teacher signs in with an @ddsb.ca Google account**. The Apps Script also refuses to send any calendar data without a verified sign-in. Teachers don't type their email, and **My bookings** shows everything they've booked on any device. The domain is set by `googleHostedDomain` in `config.js` and *Required email domain* in admin Settings; keep them the same.

**a. Create a Google sign-in client** (about 10 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com). Sign in with your **DDSB account** if it's allowed to create projects; otherwise use a personal Google account.
2. Create a project called *Winchester Library Booking*.
3. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and click **Get started**:
   - **App name:** Winchester Library Booking. **Support email:** your email.
   - **Audience:** choose **Internal** if you're on your DDSB account (only DDSB accounts can sign in, and no review is needed). On a personal account choose **External**, then on the **Audience** page click **Publish app**. The basic name-and-email sign-in used here doesn't need Google's review.
4. Go to **Clients → Create client**:
   - **Application type:** Web application. **Name:** Library booking site.
   - **Authorized JavaScript origins:** add `https://library.winchesterps.ca`.
   - Leave *Authorized redirect URIs* empty. Click **Create**.
5. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

**b. Connect it**

1. Paste the Client ID into `googleClientId` in [`assets/config.js`](assets/config.js) and upload that file to GitHub.
2. In the booking Apps Script project, paste the same ID into `GOOGLE_CLIENT_ID` at the top of `BookingApi.gs`.
3. Choose **`testSignInSetup`** and click **Run**. Approve the new permission, which lets the script check sign-ins with Google.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

> **If teachers see "Access blocked" or "This app is blocked by your administrator,"** DDSB's Google settings don't allow sign-in to apps they haven't approved. Ask DDSB IT to trust the app's Client ID (Admin console → Security → API controls → App access control). Until then, clear `googleClientId` in `config.js` (and `GOOGLE_CLIENT_ID` in `BookingApi.gs`), and the site goes back to typed emails.

### 8. Optional: only approved staff

With Google sign-in on, you can limit the site to a list of approved staff. This is under **Admin → Staff access**.

1. **Add yourself first**, then the rest of your staff. You can add them one at a time, or use **Add many at once** and paste one person per line as `Name, email`. Two columns pasted from a spreadsheet work too.
2. Tick **Only approved staff can use the booking site** and click **Save**. It won't let you switch it on while the list is empty.
3. From then on, a signed-in teacher who isn't on the list gets a **Request access** form (name and an optional note) instead of the calendar. You get an email if *Send me a copy…* is set in Settings, and a number appears on the **Staff access** tab.
4. **Approve** adds them to the list and emails them that they're in. **Deny** shows them a "speak to the librarian" message, and they can't request again unless you remove them from the Denied list.
5. **Remove** takes someone off the list. Next time they open the site, they're back to the request screen.

The list is saved in an **App Staff** tab in the Google Sheet, which is created automatically the first time it's needed.

### 9. Running the Form and the app side by side

You can keep the Google Form open while staff move over:

- **App → Sheet:** bookings made in the app are always copied into Form Responses 2, so your weekly tabs, the Google Site, the Today tab, Library Today and Home Assistant show everything.
- **Form → app:** in the booking Apps Script project, choose **`installFormSync`** and click **Run**, approving the trigger permission it asks for. From then on:
  - every Form submission is copied into the app within seconds, with an hourly back-up check
  - if a Form booking asks for a time that's already booked in the app, that time isn't copied, and you get a **"Library Form booking clash"** email naming both teachers. It goes to the *Send me a copy* address in Settings, or the script owner if that's blank.
  - the Form row itself is left as it is, so your weekly tab shows the double-booking until you sort it out

When everyone has moved over, run **`removeFormSync`** to stop the copying, then close the Form.

### 10. Switch teachers over

- On the Google Site, replace the embedded sheet and form with a link to (or an embed of) `https://library.winchesterps.ca`.
- In the Google Form, turn off **Accepting responses**. Set the closed message to *"Library booking has moved to library.winchesterps.ca"*. If you turned on the Form sync, run **`removeFormSync`** in the booking Apps Script project.

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
| Add or remove staff names in the booking form's name list | Admin → **Settings → Teachers and grades** |
| Approve, deny or remove who can sign in | Admin → **Staff access** |
| Get a full record or a spreadsheet export | The **App Bookings** tab in the Google Sheet |

**New school year:** On **School calendar**:

1. Update *First day of classes* and *Last day of school year*.
2. Delete last year's rows and add the new board dates.
3. Check that the "Check:" line shows the right cycle days.

## Logo and home-screen icon

The knight-and-book logo is used as:
- the browser tab icon (`assets/favicon.ico`, `assets/favicon-32.png`)
- the logo in the page header and sign-in screen (`assets/logo-96.png`, `assets/logo-256.png`)
- the home-screen icon on iPhone/iPad (`assets/apple-touch-icon.png`)
- the home-screen icon on Android/Chrome (`manifest.webmanifest`, `assets/icon-*.png`)

To add it to a phone's home screen:
- **iPhone:** Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → ⋮ menu → **Add to Home screen** or **Install app**.

It then opens full-screen like an app. To change the logo, replace those image files with new ones of the same names and sizes.

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

- **Teacher identity:** with Google sign-in on, nothing on the site or in the Apps Script works without a verified @ddsb.ca sign-in. The email on each booking comes from the teacher's Google account, and teachers can only change or cancel bookings made with their own account. Sign-ins last about an hour and renew quietly in the background. The admin page still uses its passcode. With sign-in off, teachers type their email (only `@ddsb.ca` is accepted, which you can change in Settings), and each booking gets a private link that's saved on their device and emailed to them.
- **Changing a booking:** teachers can edit the details, remove times that haven't happened yet, and add new times, all in one save. New times follow the same rules as a new booking. Turning off *Teachers can change and cancel their own bookings* in Settings switches off both.
- **Double bookings:** the script locks while saving. If two teachers grab the same time at once, the second one is told it's taken.
- **Email limits:** Apps Script on a school account can send about 1,500 emails a day, and far fewer on a personal Gmail account (about 100 a day). Normal library use stays well under either limit.
- **What's public:** the `apps-script` folder here is just a copy of the code for reference, and it contains no passwords. The admin passcode is stored in the script's private properties, not in this repo.
