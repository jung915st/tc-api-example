# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is written to be **refinement-ready**: it documents the current state (v2.3.3), the full frontend↔backend contract, and the known tech-debt / refinement targets so that feature work does not silently break existing behavior.

## Project Overview

GAS-ADMIN is a Google Apps Script (GAS) web application for Google Workspace domain administration. It provides a single-page dashboard for bulk management of Classroom courses, Groups, Directory/Users, Drive files, and Email — operated exclusively by the domain administrator who deploys it.

- **Runtime**: Google Apps Script V8 engine (not Node.js)
- **UI**: Traditional Chinese (繁體中文), Bootstrap 5 CDN + Vanilla JS, Bootstrap Icons
- **Timezone**: Asia/Taipei (UTC+8) — `CONFIG.TIME_ZONE = "GMT+8"`
- **Access**: `executeAs: USER_DEPLOYING`, `access: MYSELF` — runs as and is accessible only by the deployer
- **Current version**: `APP_VERSION = "2.3.3"` (single source of truth at the top of `AdminSuite.gs`; bump it on every shipped change and keep the header docblock date in sync)

## Deployment & Testing

There is no build step. Files are pushed directly to Google Apps Script:

```bash
clasp push          # Push all .gs / .html / application.json to GAS
clasp open          # Open the GAS editor in browser
clasp run           # Run a named function via CLASP
```

**Running Tests**: In the GAS editor, call `runBatchCourseUnitTests()` (defined in `AdminSuite.tests.gs`). This runs the unit suite covering CSV/TSV parsing, batch multipart request/response handling, Drive API compatibility, and retry logic. There is no automated CI — tests are pure functions that inject fakes (e.g. a fake `fetchFn` into `executeBatchOperations_`), so they run without live Google API access.

**First-time setup**: Run `setDbSpreadsheetId(spreadsheetId)` once from the GAS editor to store the target spreadsheet ID in Script Properties (`MANAGE_SPREADSHEET_ID`). Then run `installTrigger()` once to install the daily deletion trigger.

## File Structure

```
AdminSuite.gs         — All backend logic (~2300 lines, single global scope)
AdminSuite.tests.gs   — Unit test suite (pure functions + injected fakes)
index.html            — Frontend SPA (HTML + CSS + JS, ~1500 lines)
application.json      — GAS manifest (OAuth scopes, advanced services, runtime)
agents.md             — Supplementary contributor notes
```

All backend code lives in one file. There is no module system — functions are globally scoped within the GAS environment. Order does not matter (GAS hoists all top-level functions).

## Architecture

### Frontend ↔ Backend Bridge

The frontend communicates with the backend exclusively via `google.script.run`:

```javascript
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onError)
  .someBackendFunction(args);
```

All backend public functions must accept plain serializable arguments and return plain JSON-compatible objects (no `Date` round-trips that matter, no class instances, no circular refs, no Promises). When a function `throw`s, the message surfaces in `withFailureHandler`; when it returns `{ error: ... }`, the success handler must check for it.

> ⚠️ **Inconsistency to be aware of:** the codebase mixes two error strategies. Classroom/Group batch functions and several others `throw new Error(...)` (caught by `withFailureHandler`), while the header convention documented historically said "return `{ error }`". When refining, prefer **`throw new Error(message)`** for hard failures (the frontend already wires `withFailureHandler` everywhere) and reserve structured `{ successes, failures, skipped }` result objects for partial-success batch flows. Do not mix both in one function.

### Public API Surface (the bridge contract)

These are the functions the frontend calls by name. **Renaming or changing the return shape of any of these is a breaking change** — update `index.html` in the same commit and bump `APP_VERSION`.

| Backend function | Called from `index.html` | Returns |
|---|---|---|
| `doGet(e)` | (entry point) | HTML page |
| `setDbSpreadsheetId(id)` | editor only | string |
| `testApiConnection()` | `runConnectivityTest()` | string |
| **Classroom** | | |
| `createClassroomCourse(payload)` | `createCourse()` | `{id,name,section,enrollmentCode}` |
| `listCourses()` | `loadCourses()` | `[{id,name,section,enrollmentCode,ownerId}]` |
| `listArchivedCourses()` | `loadArchivedCourses()` | `[{id,name,section,ownerId}]` |
| `deleteClassroomCourse(courseId)` | `deleteCourse(id)` | string |
| `archiveClassroomCourses(ids)` | `archiveSelectedCourses()` | `{summary,archived,failed}` |
| `deleteClassroomCourses(ids)` | `deleteSelected*Courses()` | `{summary,deleted,failed}` |
| `getEnrolledStudentEmails(courseId)` | `onCourseSelectChange()` | `[email]` |
| `applyEnrollmentChanges(courseId,toEnroll,toRemove)` | `submitEnrollmentChanges()` | `{message,enrolled,removed}` |
| `processBatchCourseUpload(name,content)` | `uploadBatchCourses()` | full batch result (see below) |
| `getCourseBatchTemplate(format)` | `downloadBatchTemplate()` | `{filename,mimeType,content}` |
| `addStudentsToCourse(courseId,emails)` | (legacy path) | `{message,details}` |
| **Groups** | | |
| `getWorkspaceGroups()` | `loadGroupsForSelectors()` | `[{id,email,name,description,directMembersCount}]` |
| `processBatchGroupUpload(name,content)` | `uploadBatchGroups()` | `{jobId,summary,created,skipped,errors}` |
| `getGroupBatchTemplate(format)` | `downloadGroupBatchTemplate()` | `{filename,mimeType,content}` |
| `assignMembersToGroups(payload)` | `assignSelectedMembersToGroups()` | `{jobId,summary,added,skipped,errors}` |
| **Directory / Users** | | |
| `getDomainOUs()` | `loadOUs()` / `initOUs()` | `[orgUnitPath]` (sorted) |
| `getFilteredUsers(ouPath,cond,date)` | `filterUsers()`, `loadStudentsFromOu()`, `loadTeacherCandidates()` | `[{name,email,lastLogin,suspended,org}]` |
| `moveUsersToOU(emails,targetOU)` | `bulkMoveUsers()` | `{message,errors}` |
| **Lifecycle** | | |
| `processUserSuspension(emails)` | `suspendSelected()` | string |
| `syncSuspendedToQueue()` | `syncSuspended()` | string |
| `installTrigger()` | `installTrigger()` | string |
| `checkDeletionQueue()` | trigger (daily 1 AM) | string |
| **Drive** | | |
| `findOutdatedFiles(dateString)` | `auditDrive()` | `[{id,name,link,owner,modified,size,isFolder}]` |
| `manageFiles(fileIds,action)` | `manageFiles(action)` | string |
| **Email** | | |
| `sendCustomEmailBatch(emails,subject,body)` | `sendBatchEmail()` | `{message,successCount,failCount}` |

`processBatchCourseUpload` return shape consumed by `renderBatchResult()`:
`{ fileName, delimiter, rowLimit, summary:{totalRows,attemptedRows,created,partial,skipped,errors}, created:[{rowNumber,courseId,name,section,teacherEmail,enrollmentCode,teacherStatus,teacherError}], skipped:[{rowNumber,reason}], errors:[{rowNumber,stage,statusCode,message}] }`

### Naming Conventions

- **Public functions** (callable from frontend via `google.script.run`): no suffix, e.g. `listCourses()`. These form the bridge contract above.
- **Private/internal helpers**: trailing underscore, e.g. `logSystemAction_()`, `fetchDriveFilesWithPagination_()`. Never call these from the frontend.
- **Constants**: `SCREAMING_SNAKE_CASE` at the top of `AdminSuite.gs` (`APP_VERSION`, `CONFIG`, `COURSE_BATCH_CONFIG`, `GROUP_BATCH_CONFIG`, `*_ALIAS_LOOKUP`, `*_REQUIRED_FIELDS`, `GROUP_MEMBER_ALLOWED_ROLES`).

### Data Persistence

A single Google Spreadsheet stores all state (configured via `setDbSpreadsheetId()`, read by `getDBSpreadsheet_()` which falls back to the active spreadsheet). Each writer lazily creates its sheet with a frozen header row if missing (`ensureCourseSheet_`, `ensureGroupAuditSheet_`, inline creation elsewhere).

| Sheet (`CONFIG` key) | Purpose | Auto-truncates at |
|---|---|---|
| `Classroom_Courses` (`SHEET_NAME_COURSES`) | Course records | — |
| `Classroom_Logs` (`SHEET_NAME_LOGS`) | System action log (`logSystemAction_`) | 2,000 rows |
| `Action_Logs` (`SHEET_NAME_ACTIONS`) | User lifecycle / deletion queue | — |
| `Group_Audit_Logs` (`SHEET_NAME_GROUP_AUDIT`) | Group/member operation audit | 5,000 rows |
| `Email_Logs` (`SHEET_NAME_EMAILS`) | Email send history | — |
| `Drive_Audit_Logs` (`SHEET_NAME_DRIVE_AUDIT`) | Drive audit snapshots (one row per file per run) | — |

`Action_Logs` doubles as the **deletion queue**: `processUserSuspension`/`syncSuspendedToQueue` append `[timestamp, email, "Suspended", scheduledDeletionDate, version]`, and `checkDeletionQueue` rewrites the whole sheet each run, deleting accounts whose scheduled date has passed.

### Batch Processing Pattern

All batch upload features follow this pipeline:

1. Parse CSV/TSV with auto-delimiter detection (`detectBatchDelimiter_()` — extension first, then tab-vs-comma count on line 1; strips BOM)
2. Normalize headers via alias map (`normalizeHeader_` + `*_HEADER_ALIAS_LOOKUP`)
3. Validate required fields and email format (`isValidEmail_`)
4. De-duplicate against existing remote state **and** within the upload file
5. Enforce row limit (`MAX_ROWS = 100` per batch)
6. Execute (Classroom: chunked multipart batch of `MAX_CALLS_PER_BATCH = 50`; Groups: sequential inserts)
7. Return `{ summary, created, skipped, errors }` (Groups also include a `jobId`)

### Classroom Batch API

Classroom create/archive/delete use a custom **multipart/mixed** batch HTTP request to `https://classroom.googleapis.com/batch` rather than per-call SDK calls, to avoid quota exhaustion. The full request/response machinery:

- `buildBatchMultipartRequest_()` — assembles the multipart body (CRLF-delimited, `Content-ID: <contentId>`)
- `executeBatchOperations_()` → `executeBatchChunk_()` — chunks ops, fetches with the OAuth token, accepts an injectable `fetchFn` for tests
- `parseBatchMultipartResponse_()` → `parseEmbeddedHttpResponse_()` — splits parts, parses each embedded HTTP status/body
- `mapBatchResultsByContentId_()` — keys results back to their request `contentId`

Course batch create is **two-phase**: phase 1 creates all courses, phase 2 assigns teachers only for successfully-created courses (`runCourseBatchPhases_`). A failed teacher assignment yields `teacherStatus: "FAILED"` (partial), not a hard error.

### Retry Pattern (Group Member Insert)

`runGroupMemberInsertWithRetry_()` does 3 attempts with linear backoff (`3000 * attempt` ms → 3 s, 6 s, 9 s). "Already a member" → silently `SKIPPED`; transient propagation errors ("not found", still-propagating group) → retried; other errors → `FAILED`. Classified by `isMemberAlreadyExistsError_` / `isTransientGroupPropagationError_`.

### Error Handling Helpers

`extractErrorReasonFromException_()`, `getExceptionMessage_()`, `safeJsonParse_()`, `extractApiErrorMessage_()`, `parseStatusCodeFromError_()`, `truncateLogDetail_()` (caps log cells; 3500 for system logs, 1000 for audit cells).

### Drive Audit — `findOutdatedFiles`

`findOutdatedFiles(dateString)` works in two phases (see header docblock for the rationale):

1. **Paginated global search** — `fetchDriveFilesWithPagination_()` follows `nextPageToken` until `MAX_TOTAL = 500`. `orderBy` is intentionally omitted — unsupported with `corpora: 'allDrives'`, causes "Invalid Value".
2. **BFS recursive folder scan** — every discovered folder is expanded (children fetched with **no date filter**, so recently-added files inside stale folders are caught), de-duplicated by file ID, up to `MAX_BFS_ITEMS = 2000` internal ceiling.

Results are sorted in memory (largest `quotaBytesUsed` first, then oldest `modifiedTime`), the top `MAX_TOTAL` are written to `Drive_Audit_Logs` via `appendDriveAuditLog_()`, then mapped to the UI shape. Owner column = full Gmail address; Shared Drive items = `"Shared Drive"`.

> **Contract:** the return shape `{ id, name, link, owner, modified, size, isFolder }` is consumed directly by `auditDrive()` and **must not change**.

### Drive Delete Fallback Chain

`manageFiles(fileIds, 'delete')` → `removeDriveFileWithCompatibility_()`: permanent delete → (on permission error) move to trash → reported as `TRASHED` fallback. `deleteDriveFilePermanently_` / `trashDriveFileWithCompatibility_` also probe both the modern (`{supportsAllDrives:true}`) and legacy method signatures to survive GAS Advanced Drive Service version differences (`isMethodSignatureError_`). `'archive'` renames the file with an `[ARCHIVED]_` prefix.

## Google APIs Used

Declared as Advanced Services in `application.json`.

| Service | `userSymbol` | Version | Usage |
|---|---|---|---|
| Admin Directory | `AdminDirectory` | directory_v1 | Users, OUs, Groups, Members |
| Google Drive | `Drive` | v3 | File list, metadata, delete/trash |
| Drive Activity | `DriveActivity` | v2 | **Declared but not yet used** (reserved) |
| Google Classroom | `Classroom` | v1 | Courses, rosters, teacher assignment |
| Gmail | `Gmail` | v1 | (manifest); runtime sends via `GmailApp` |

Other bindings used directly: `SpreadsheetApp`, `PropertiesService`, `ScriptApp` (triggers + OAuth token for batch), `Utilities`, `Session`, `HtmlService`, `GmailApp`, `UrlFetchApp` (Classroom batch endpoint only).

> ⚠️ `DriveActivity` (v2) and the `mail.google.com` + `userinfo.email` scopes are declared in the manifest but the code does not yet exercise the Drive Activity API. If a feature does not need it, leaving it declared is harmless but expands the consent screen. Treat it as a reserved hook for future "last activity" auditing.

All Drive API calls must include `supportsAllDrives: true` (and `includeItemsFromAllDrives: true` for list) to operate on Shared Drive files.

## Time-Based Trigger

`checkDeletionQueue()` runs daily at 1 AM (Asia/Taipei) to permanently delete suspended accounts past their scheduled deletion date (suspension date + 3 months). Install once via `installTrigger()` (which first removes any existing `checkDeletionQueue` trigger to avoid duplicates).

## Key Constraints

- GAS execution timeout: **6 minutes** for web-app/manual executions, **30 minutes** for triggered executions. Long batch loops must respect this — the 100-row batch cap exists for this reason.
- `UrlFetchApp` is used **only** for the custom Classroom batch endpoint. All other Google API access uses Advanced Service bindings.
- Do **not** add `npm`, `webpack`, or any Node.js tooling — the runtime is GAS V8, not Node. No ES modules, no `require`/`import`.
- The manifest file is `application.json`, not `appsscript.json` (CLASP renames it on push).
- Keep the UI strings in Traditional Chinese to match the existing dashboard.

---

## Refinement Targets & Known Tech Debt

Address these when touching the relevant feature. Listed roughly by severity.

### 1. ✅ Template-literal bug cluster (user-visible) — RESOLVED in v2.3.3

Previously, many strings in Features 3–6 used **single quotes** with `${...}` syntax, which does **not** interpolate in JavaScript — the admin saw literal text like `Moved ${count} users.` instead of `Moved 5 users.`. All 22 occurrences (in `moveUsersToOU`, `processUserSuspension`, `syncSuspendedToQueue`, `checkDeletionQueue`, `manageFiles` + its Drive helpers, `sendCustomEmailBatch`, and `testApiConnection`) were converted to backtick template literals in v2.3.3. Features 1–2 were already correct.

> **Guard against regression:** when adding user-facing or log strings with `${...}`, always use backticks. A quick scan: `grep -nE "'[^']*\\$\{[^']*'" AdminSuite.gs` should return only the two legitimate Drive-query lines (the `${cutoff}` / `${folder.id}` queries, which are already inside backtick literals).

### 2. 🟠 Defensive null-handling in Directory reads

- `getFilteredUsers` dereferences `user.name.fullName` (line ~1773) — a user with no `name` object throws and aborts the whole listing. Guard with `user.name && user.name.fullName` or `(user.name||{}).fullName`.
- `moveUsersToOU` / `processUserSuspension` swallow per-item errors silently (`catch(err){}`) — collect reasons into the returned `errors[]` for parity with the batch features.

### 3. 🟠 Email personalization N+1

`sendCustomEmailBatch` fetches each user's name with an individual `AdminDirectory.Users.get` call when `{name}` is used (line ~2260). For large recipient lists this is slow and quota-heavy. Refinement: batch-resolve names up front, or document/cap the recipient count. There is also **no per-recipient rate limiting** — `GmailApp` daily send quota can be exhausted.

### 4. 🟡 Error-strategy consistency

Standardize on `throw new Error(message)` for hard failures (frontend already wires `withFailureHandler`). Do not introduce mixed `{ error }`-return-plus-throw functions. Keep `{ summary, created, skipped, errors }` only for partial-success batch flows.

### 5. 🟡 Pagination / cap visibility

`listCourses` / `listArchivedCourses` use `pageSize: 50` with **no** `nextPageToken` follow-through — domains with >50 active courses silently truncate. `findOutdatedFiles` caps at 500 results. When refining, either paginate fully or surface the cap to the UI so the admin knows results were trimmed.

### 6. 🟡 `Action_Logs` full-sheet rewrite

`checkDeletionQueue` reads the entire sheet and writes it back every run. Fine at current scale; if the queue grows large, switch to targeted row updates to stay within execution time.

## How to Add a Feature (checklist)

1. **Backend**: add a public function (no underscore) in `AdminSuite.gs` under the relevant `FEATURE N` banner; keep helpers `_`-suffixed. Wrap the body in try/catch and `throw new Error(...)` on failure. Use **backtick** template literals (see Refinement Target #1).
2. **Logging**: call `logSystemAction_(action, target, status, detail)` for every state-changing operation; use `truncateLogDetail_` on long details. For multi-item audit trails, follow the `appendGroupAuditLogs_` pattern (lazy sheet creation + truncation cap).
3. **Frontend**: add the UI in the matching tab in `index.html`, call via `google.script.run.withSuccessHandler(...).withFailureHandler(...)`, and keep UI text in Traditional Chinese. Use `setLoader(true/false)` and `escapeHtml()` for any rendered user/API data.
4. **Scopes/services**: if a new Google API is needed, add it to `application.json` (`enabledAdvancedServices` + `oauthScopes`) and document it in the API table above. Minimize scope.
5. **Contract**: if you change any public function's name or return shape, update the bridge-contract table, the consuming `index.html` function, and **bump `APP_VERSION`** + the header docblock date in the same commit.
6. **Tests**: add pure-function unit tests to `AdminSuite.tests.gs` for any parsing/validation/transform logic, injecting fakes for I/O (follow the existing `fetchFn` injection pattern). Run `runBatchCourseUnitTests()` in the editor before pushing.
7. **Deploy**: `clasp push`, then re-deploy the web app if the entry point or manifest changed.
