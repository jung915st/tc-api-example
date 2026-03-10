# GAS-ADMIN — Agent Development Guide

> **Version:** 2.2.1 | **Last Updated:** 2026-03-10
> **Stack:** Google Apps Script (V8), Bootstrap 5, Google Workspace APIs

---

## Project Overview

**AdminSuite** is a Google Workspace domain administration tool deployed as a GAS Web App. It provides a centralized dashboard for bulk management of Classroom, Groups, Directory, Drive, and Email — targeting IT admins managing large organizational units.

**Language:** Traditional Chinese (繁體中文) UI
**Timezone:** Asia/Taipei (UTC+8)
**Deployment:** Web App (`executeAs: USER_DEPLOYING`, `access: MYSELF`)

---

## Repository Structure

```
GAS-ADMIN/
├── AdminSuite.gs          # All backend logic (~2,025 lines)
├── AdminSuite.tests.gs    # Unit test suite (~424 lines, 30+ tests)
├── index.html             # Frontend web UI (~1,500+ lines)
└── application.json       # GAS manifest (scopes, services, runtime)
```

---

## Architecture

### Backend (`AdminSuite.gs`)

Single-file GAS script. All functions are in one flat namespace.

**Public API functions** (called from frontend via `google.script.run`):
- No underscore suffix
- Return plain objects/arrays (serialized over GAS bridge)

**Private/internal functions**:
- Suffix with `_` (e.g., `getDBSpreadsheet_()`)

**Constants** (at top of file):
- `APP_VERSION` — current version string
- `CONFIG` — spreadsheet sheet names, row limits, etc.
- `COURSE_BATCH_CONFIG` — batch upload settings (max rows, chunk size)

### Frontend (`index.html`)

Single-file Bootstrap 5 SPA. All tabs, forms, and JS in one file.

- Calls backend via `google.script.run.withSuccessHandler().withFailureHandler()`
- Loading overlays on all async operations
- No external JS dependencies beyond Bootstrap CDN

### Data Storage

All persistent data lives in a single Google Spreadsheet (configured via `setDbSpreadsheetId()`), stored in script properties as `MANAGE_SPREADSHEET_ID`.

| Sheet | Purpose |
|---|---|
| `Classroom_Courses` | Course records (ID, Name, Section, Owner, Teacher, Created) |
| `Classroom_Logs` | System action log (auto-truncates at 2000 rows) |
| `Action_Logs` | User lifecycle events (suspension, deletion queue) |
| `Group_Audit_Logs` | Group/member operation audit trail (auto-truncates at 5000 rows) |
| `Email_Logs` | Email send history |

---

## Feature Modules

### 1. Classroom Management
- Single course create/delete
- List active courses; list archived courses
- **Bulk archive** selected active courses (batch PATCH `courseState: ARCHIVED`)
- **Bulk delete** selected active or archived courses (batch DELETE)
- **Batch course upload** (CSV/TSV, max 100 rows)
  - 2-phase: create courses → assign teachers
  - Classroom batch API (`https://classroom.googleapis.com/batch`), max 50 per batch
  - Multipart/mixed request building and response parsing
  - Header aliases, duplicate detection, partial success tracking

### 2. Group & Member Management
- List all Workspace groups
- **Batch group creation** (CSV/TSV, max 100 rows, audit logged)
- **Assign members to groups** — multi-group targeting, role control (MEMBER/MANAGER/OWNER)
  - Retry logic: 3 attempts with exponential backoff for propagation delays
  - Skips "already exists" gracefully

### 3. User & Directory Management
- List OUs (organizational units)
- Filter users by OU, last login condition, suspended status
- Move users to OU (batch)
- Suspend users with scheduled deletion date (3 months out)

### 4. Lifecycle Automation
- Sync suspended users to deletion queue
- Daily trigger (1 AM) to permanently delete accounts past deletion date
- `installTrigger()` — sets up time-based trigger

### 5. Drive Audit & Management
- Find files modified before a date (all drives, sorted: largest → oldest)
- Batch file actions: delete (with trash fallback) or archive (rename with `[ARCHIVED]_` prefix)
- Permission error handling: falls back to trash if organizer role denied

### 6. Email Notifications
- Send custom HTML emails to a list of recipients
- Template variables: `{name}`, `{email}` (user lookup via Admin SDK)
- Logs results to `Email_Logs` sheet

### 7. Centralized Logging
- `logSystemAction_()` — writes to `Classroom_Logs`
- `appendGroupAuditLogs_()` — granular per-row audit to `Group_Audit_Logs`
- Both sheets auto-truncate to prevent unbounded growth

---

## Key Patterns & Conventions

### Naming
```javascript
// Public (callable from frontend)
function listCourses() { ... }

// Private (internal helpers)
function getDBSpreadsheet_() { ... }

// Constants
const APP_VERSION = '2.2.1';
const CONFIG = { ... };
```

### Error Handling
- All public functions: `try/catch` with structured error returns
- `extractErrorReasonFromException_(e)` — parses GAS exception messages
- `safeJsonParse_()` — safe JSON.parse with fallback
- API error extraction: `extractApiErrorMessage_(response)`

### Batch Processing Pattern
```javascript
// 1. Parse and validate input
// 2. Deduplicate (using Set for O(1) lookup)
// 3. Chunk into groups (e.g., 50 per Classroom batch)
// 4. Execute with error tracking per item
// 5. Return { successes, failures, skipped } summary
```

### Retry Pattern (Group Member Insert)
```javascript
// 3 attempts, backoff = attempt * 3000ms
// Distinguishes transient errors from permanent failures
// Skips "already exists" without counting as error
```

### CSV/TSV Processing
- Auto-detect delimiter: `detectBatchDelimiter_()`
- Normalize headers, support aliases (e.g., "Course Name" → `name`)
- Validate required fields and email format before processing
- Enforce row limits before execution

---

## Adding New Features — Checklist

1. **Backend (`AdminSuite.gs`):**
   - Add public entry function (no `_` suffix)
   - Use `logSystemAction_()` for audit trail
   - Follow try/catch + structured return pattern
   - If batch: follow chunk → execute → track pattern

2. **Frontend (`index.html`):**
   - Add tab to sidebar nav
   - Add tab content panel with Bootstrap 5 markup
   - Use `google.script.run.withSuccessHandler().withFailureHandler()` for all calls
   - Show/hide loading overlay during async ops
   - UI copy in Traditional Chinese

3. **Tests (`AdminSuite.tests.gs`):**
   - Add tests for any new parsing, validation, or transformation logic
   - Run via `runBatchCourseUnitTests()` in Apps Script editor
   - Test edge cases: empty input, malformed data, API errors

4. **Manifest (`application.json`):**
   - Add any new OAuth scopes required
   - Add new Advanced Services if needed

---

## Testing

No external test runner. Tests execute directly in the Apps Script editor.

```javascript
// Entry point — run this function in the GAS editor
runBatchCourseUnitTests()
```

**Test categories covered:**
- CSV/TSV delimiter detection
- Header alias mapping
- Row validation (required fields, email format)
- Row limit enforcement
- Batch chunking and multipart request building
- Drive API compatibility (method signatures, permission fallbacks)
- Retry logic for transient errors
- Group/member audit log building

**Naming convention for tests:** `test_<feature>_<scenario>()`

---

## Google APIs Used

| Service | Symbol | Purpose |
|---|---|---|
| Admin Directory v1 | `AdminDirectory` | Users, groups, OUs |
| Drive v3 | `Drive` | File management |
| Drive Activity v2 | `DriveActivity` | (Available, currently unused) |
| Classroom v1 | `Classroom` | Course management |
| Gmail v1 | `Gmail` | Email sending |
| SpreadsheetApp | (built-in) | Logging / data storage |
| PropertiesService | (built-in) | Config (spreadsheet ID) |
| ScriptApp | (built-in) | Triggers |

---

## OAuth Scopes (application.json)

- `script.external_request` — HTTP batch requests to Classroom API
- `spreadsheets` — Read/write logging spreadsheet
- `classroom.courses`, `classroom.rosters` — Course/student management
- `admin.directory.user`, `admin.directory.group`, `admin.directory.orgunit` — Admin SDK
- `drive`, `drive.metadata` — File management
- `gmail.send` — Email notifications

---

## Common Gotchas

- **GAS execution limit:** 6 minutes per execution. Large batch jobs must stay under this.
- **Classroom batch max:** 50 operations per multipart batch request.
- **Group propagation delay:** New groups may not be immediately visible to Admin SDK — retry with backoff.
- **Drive delete vs remove:** `Drive.Files.delete()` vs `Drive.Files.remove()` — compatibility handled by `deleteFile_()`.
- **Shared Drive delete:** Requires organizer role. Falls back to trash if denied.
- **All-drives queries:** Must include `includeItemsFromAllDrives: true, supportsAllDrives: true`.
- **Spreadsheet auto-truncation:** `Classroom_Logs` caps at 2000 rows; `Group_Audit_Logs` caps at 5000.
- **Script property:** Spreadsheet ID stored as `MANAGE_SPREADSHEET_ID` via `PropertiesService`.

---

## Deployment

No CI/CD. Deploy manually via:
1. Google Apps Script editor (copy-paste or CLASP push)
2. CLASP CLI: `clasp push` from project root

**CLASP config** is not committed to this repo — configure locally with `clasp login`.

---

## Version History Reference

### Versioning Rubric

| Increment | When to use |
|---|---|
| **Major** (`X.0.0`) | Architectural overhaul, breaking API changes, new top-level feature module (new tab) |
| **Minor** (`x.Y.0`) | New public functions or user-visible features within an existing module (no breaking changes) |
| **Patch** (`x.y.Z`) | Bug fixes, logging tweaks, copy changes, refactors with no behaviour change |

### Changelog

| Version | Type | Notable Change |
|---|---|---|
| 2.2.1 | patch | Classroom: enroll/disenroll toggle — uncheck removes student from course; applyEnrollmentChanges replaces enrollCheckedStudents; loadedOuEmails_ tracks rendered list |
| 2.2.0 | minor | Classroom: enroll students pre-check — auto fetch course roster on course select, pre-check enrolled students with 已加入 badge on OU load |
| 2.1.0 | minor | Classroom: bulk archive active courses, bulk delete active/archived courses, archived course list UI |
| 2.0.0 | major | Group management module: batch group creation, multi-group member assignment |
| 1.9.0 | minor | Email notification enhancements |
| 1.8.7 | patch | Batch course upload logging improvements |
| 1.8.x | minor | Batch course upload (Classroom batch API, CSV/TSV, 2-phase teacher assign) |
