# Domain Admin Suite

A Google Apps Script web app for Google Workspace for Education administrators:
Classroom, Groups, Directory, Drive audit and bulk email — from one page.

**Version 2.7.0** · Runtime V8 · Timezone Asia/Taipei

---

## Features

| # | Area | What it does |
|---|------|--------------|
| 1 | Classroom | Create / archive / delete courses, manage teachers, roster students by OU, batch-create from CSV/TSV |
| 2 | Groups | Batch-create groups, assign members to multiple groups by OU |
| 3 | Directory | Find inactive users, suspend / unsuspend, move OU |
| 4 | **Bulk User Update** | CSV/TSV update of name, Org Unit and suspend state, with mandatory preview |
| 5 | **Roster Bulk Upload** | CSV/TSV student enrolment by `courseId` or `courseName` + `section` |
| 6 | **Course Bulk Edit** | Set-value or find-and-replace on `name` / `section` / `description` |
| 7 | Lifecycle | Auto-delete accounts suspended for 3 months (daily trigger) |
| 8 | Drive | Outdated-file audit with shared-drive sweep; batch delete / archive |
| 9 | Email | HTML notifications with `{name}` / `{email}` variables |

Items 4–6 are new in 2.7.0.

---

## Requirements

- Google Workspace with **super-admin** rights
- Advanced services (declared in `appsscript.json`, enabled automatically by `clasp push`):
  `AdminDirectory`, `Drive`, `DriveActivity`, `Classroom`, `Gmail`

---

## Setup

### Option A — Make a copy (no tools needed, ~10 min)

1. Open the shared script → **File → Make a copy**
2. **Extensions → Apps Script**
3. **Services (+)** → add Admin SDK API, Drive API, Drive Activity API, Google Classroom API, Gmail API
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Only myself**
5. Open the web app URL, authorise, then run **Test API Connection**

### Option B — clasp (recommended, works on Windows)

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Domain Admin Suite" --rootDir .
clasp push
clasp deploy
```

`clasp push` uploads `appsscript.json`, so the five advanced services and all
OAuth scopes are configured for you — this is the main reason to prefer B over A.

> **Windows note:** works in PowerShell, CMD and WSL. If `clasp` is not
> recognised after install, add `%APPDATA%\npm` to your PATH. If PowerShell
> blocks the script, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> `clasp login` opens a browser; credentials land in `%USERPROFILE%\.clasprc.json`.

### First run

1. Open the web app URL
2. Paste a Google Sheet ID into **Spreadsheet ID** and save (this becomes the log DB)
3. Click **Test API Connection**
4. Optional: **Install Auto-Delete Trigger** — see the warning below

---

## Bulk User Update

**Required column:** `email`
**Updatable columns:** `firstName`, `lastName`, `orgUnitPath`, `suspended`

Google Admin console export headers are accepted verbatim
(`Email Address [Required]`, `First Name [Required]`, `Org Unit Path [Required]`,
`New Status [UPLOAD ONLY]`, …), so a file exported from Admin can be uploaded unchanged.

```csv
email,firstName,lastName,orgUnitPath,suspended
292953@school.edu,吳昱皓,3年一班01號,/openid/學生/三年級,FALSE
047052@school.edu,,,,TRUE
```

`suspended` accepts `TRUE/FALSE`, `1/0`, `Active/Suspended`, `是/否`.

### Rules

- **Preview is mandatory.** *Apply* stays disabled until a preview runs, and the
  diff is recomputed at apply time so a stale preview cannot write the wrong thing.
- **Rows already matching the directory are never written** — re-running the same
  file is a no-op.
- **Passwords are never touched.** There is no password column, by design: these
  accounts authenticate through an external SAML IdP.
- **Maximum 600 non-empty rows** per upload. Larger files must be split.
- Unsuspending an account (`suspended=FALSE`) also removes it from the pending
  auto-deletion queue.

---

## ⚠️ Auto-deletion trigger

`checkDeletionQueue()` runs daily and **permanently deletes** any account that has
been suspended for 3 months, based on the `Action_Logs` sheet. `syncSuspendedToQueue()`
adds *every* currently-suspended account to that queue.

Consequence: suspending an account for any reason starts a 3-month deletion clock.
Google's own restore window is only 20 days, so deletion here is effectively final.

Before installing the trigger, decide whether that is what you want. To keep accounts
indefinitely, don't install it and use suspend as an end state.

---

## Testing

Run `runBatchCourseUnitTests()` in the Apps Script editor. All tests are offline —
API calls are dependency-injected — so the suite is safe to run in a live project.

---

## Project layout

```
appsscript.json   manifest — advanced services, OAuth scopes, web app config
code.gs           server-side: all features + helpers
Index.html        single-page UI (Bootstrap 5) + client JS
tests.gs          offline unit tests
```

## Pushing to GitHub

Apps Script has no Git integration; `clasp` and `git` are separate tools that
happen to share a folder.

```bash
git init
git remote add origin https://github.com/<you>/<repo>.git
clasp push     # local -> Apps Script
git add -A && git commit -m "..." && git push   # local -> GitHub
```

`clasp pull` brings editor changes back down so you can commit them.

**Do not commit** `.clasp.json` (contains your script ID) or `.clasprc.json`
(contains your OAuth token). Suggested `.gitignore`:

```
.clasp.json
.clasprc.json
node_modules/
```

Commit `.clasp.json.example` instead:

```json
{ "scriptId": "REPLACE_WITH_YOUR_SCRIPT_ID", "rootDir": "." }
```
