# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GAS-ADMIN is a Google Apps Script (GAS) web application for Google Workspace domain administration. It provides a single-page dashboard for bulk management of Classroom courses, Groups, Directory/Users, Drive files, and Email — operated exclusively by the domain administrator who deploys it.

- **Runtime**: Google Apps Script V8 engine (not Node.js)
- **UI**: Traditional Chinese (繁體中文), Bootstrap 5 CDN + Vanilla JS
- **Timezone**: Asia/Taipei (UTC+8)
- **Access**: `executeAs: USER_DEPLOYING`, `access: MYSELF` — runs as and is accessible only by the deployer

## Deployment & Testing

There is no build step. Files are pushed directly to Google Apps Script:

```bash
clasp push          # Push all .gs / .html / application.json to GAS
clasp open          # Open the GAS editor in browser
clasp run           # Run a named function via CLASP
```

**Running Tests**: In the GAS editor, call `runBatchCourseUnitTests()` (defined in `AdminSuite.tests.gs`). This runs 24 unit tests covering CSV/TSV parsing, batch operations, Drive API compatibility, and retry logic. There is no automated CI.

**First-time setup**: Run `setDbSpreadsheetId(spreadsheetId)` once from the GAS editor to store the target spreadsheet ID in Script Properties (`MANAGE_SPREADSHEET_ID`).

## File Structure

```
AdminSuite.gs         — All backend logic (~2200 lines)
AdminSuite.tests.gs   — Unit test suite (24 tests)
index.html            — Frontend SPA (HTML + CSS + JS, ~1500 lines)
application.json      — GAS manifest (OAuth scopes, advanced services, runtime)
```

All backend code lives in a single file. There is no module system — functions are globally scoped within the GAS environment.

## Architecture

### Frontend ↔ Backend Bridge

The frontend communicates with the backend exclusively via `google.script.run`:

```javascript
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onError)
  .someBackendFunction(args);
```

All backend public functions must accept plain serializable arguments and return plain JSON-compatible objects. The GAS bridge does not support Promises, class instances, or circular references.

### Data Persistence

A single Google Spreadsheet stores all state (configured via `setDbSpreadsheetId()`). Sheet names and their purposes:

| Sheet | Purpose | Auto-truncates at |
|---|---|---|
| `Classroom_Courses` | Course records | — |
| `Classroom_Logs` | System action log | 2,000 rows |
| `Action_Logs` | User lifecycle events | — |
| `Group_Audit_Logs` | Group/member operation audit | 5,000 rows |
| `Email_Logs` | Email send history | — |

### Naming Conventions

- Public functions (callable from frontend via `google.script.run`): no suffix, e.g. `listCourses()`
- Private/internal helpers: trailing underscore, e.g. `logSystemAction_()`
- Constants: `SCREAMING_SNAKE_CASE` at the top of `AdminSuite.gs` (e.g. `APP_VERSION`, `CONFIG`, `*_CONFIG`, `*_LOOKUP`)

### Batch Processing Pattern

All batch upload features follow this pipeline:

1. Parse CSV/TSV with auto-delimiter detection (`detectDelimiter_()`)
2. Normalize headers (alias map for flexible field names)
3. Validate required fields and email format
4. Enforce row limit (100 rows max per batch)
5. Chunk into sub-batches (max 50 per Classroom Batch API request)
6. Execute with per-item error tracking
7. Return `{ successes: [], failures: [], skipped: [] }`

### Classroom Batch API

Classroom operations use a custom multipart/mixed batch HTTP request to `https://classroom.googleapis.com/batch` rather than individual API calls. This avoids per-call quota exhaustion. See `buildClassroomBatchRequest_()` for the implementation.

### Retry Pattern (Group Member Insert)

Group member insertions use 3 attempts with linear backoff (3 s, 6 s, 9 s). "Already a member" errors are silently skipped; transient propagation errors are retried; other errors are recorded as failures.

### Error Handling

All public functions wrap their body in `try/catch` and return structured error objects. Do not use `throw` across the GAS bridge — return `{ error: message }` instead. Helper utilities: `extractErrorReasonFromException_()`, `safeJsonParse_()`, `extractApiErrorMessage_()`.

### Drive Delete Fallback Chain

Drive file deletion uses a three-step fallback: permanent delete → move to trash → rename with `[ARCHIVED]_` prefix. This handles permission edge cases on Shared Drives.

## Google APIs Used

Declared as Advanced Services in `application.json`. All calls go through the GAS service bindings — do not use `UrlFetchApp` for these unless implementing custom batch requests.

| Service | Binding | Usage |
|---|---|---|
| Admin Directory v1 | `AdminDirectory` | Users, OUs, Groups, Members |
| Google Classroom v1 | `Classroom` | Courses, rosters, teacher assignment |
| Google Drive v3 | `Drive` | File list, metadata, delete/trash |
| Gmail v1 | `GmailApp` | HTML email sending |
| Spreadsheet | `SpreadsheetApp` | Logging and configuration |
| Script Properties | `PropertiesService` | Config key-value store |
| Triggers | `ScriptApp` | Time-based daily deletion queue trigger |

All Drive API calls must include `supportsAllDrives: true` to operate on Shared Drive files.

## Time-Based Trigger

`checkDeletionQueue()` runs daily at 1 AM (Asia/Taipei) to permanently delete suspended user accounts past their scheduled deletion date. Install it once via `installTrigger()`.

## Key Constraints

- GAS execution timeout is 6 minutes for regular executions, 30 minutes for triggered executions. Long batch operations must respect these limits.
- `UrlFetchApp` is used only for the custom Classroom batch API endpoint. All other Google API calls use the built-in Advanced Service bindings.
- Do not add `npm`, `webpack`, or any Node.js tooling — the runtime is GAS V8, not Node.
- The manifest file is `application.json`, not `appsscript.json` (CLASP renames it on push).
