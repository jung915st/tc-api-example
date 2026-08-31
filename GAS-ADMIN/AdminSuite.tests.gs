/**
 * Unit tests for Classroom batch upload helpers.
 * Run `runBatchCourseUnitTests()` in Apps Script editor.
 */

function runBatchCourseUnitTests() {
  const tests = [
    test_mapUserBatchHeaderIndexes_aliases,
    test_mapUserBatchHeaderIndexes_shortAliases,
    test_mapUserBatchHeaderIndexes_missingEmail,
    test_mapUserBatchHeaderIndexes_noEditableColumn,
    test_parseSuspendedValue_variants,
    test_validateBatchUserRow_rejectsBadOu,
    test_validateBatchUserRow_rejectsNoChange,
    test_assertUserBatchRowLimit_over600,
    test_buildUserBatchDiff_classifies,
    test_buildUserUpdatePayload_shapes,
    test_buildUserUpdatePayload_omitsUntouchedFields,
    test_parseUserBatchFile_skipsDuplicatesAndInvalid,
    test_executeUserBatchChunk_retriesOn429,
    test_executeUserBatchChunk_reportsHardFailure,
    test_getUserBatchTemplate_hasNoPasswordColumn,
    test_mapRosterBatchHeaderIndexes_requiresCourseRef,
    test_mapRosterBatchHeaderIndexes_acceptsCourseName,
    test_validateBatchRosterRow_invalidEmail,
    test_getCourseStudentBatchTemplate_csv,
    test_previewCourseBulkEdit_rejectsBadField,
    test_previewCourseBulkEdit_rejectsEmptySelection,
    test_detectDelimiter_csv,
    test_detectDelimiter_tsv,
    test_mapHeaderIndexes_aliases,
    test_mapHeaderIndexes_missingRequiredTeacherEmail,
    test_validateBatchRow_missingTeacherEmail,
    test_validateBatchRow_invalidTeacherEmail,
    test_enforceBatchLimit_over100,
    test_buildCourseKey_normalization,
    test_buildAndParseMultipart,
    test_executeBatchOperations_chunking,
    test_runCourseBatchPhases_continueOnError,
    test_getCourseBatchTemplate_csv_tsv,
    test_buildBatchCreateLogDetail_includesPartialTeacherFailure,
    test_mapGroupHeaderIndexes_aliases,
    test_mapGroupHeaderIndexes_missingRequiredEmail,
    test_validateBatchGroupRow_invalidEmail,
    test_normalizeGroupMemberRole_invalid,
    test_getGroupBatchTemplate_csv_tsv,
    test_buildGroupBatchCreateLogDetail_includesPreview,
    test_buildGroupMemberAssignLogDetail_includesPreview,
    test_removeDriveFileWithCompatibility_prefersDelete,
    test_removeDriveFileWithCompatibility_usesRemoveFallback,
    test_removeDriveFileWithCompatibility_permissionFallbackToTrash,
    test_isDeletePermissionError_localizedGoogleJsonResponseException,
    test_isDeletePermissionError_structuredCodeAndReason,
    test_isDeletePermissionError_ignoresUnrelatedErrors,
    test_isDriveNotFoundError_detects404,
    test_removeDriveFileWithCompatibility_localized403FallsBackToTrash,
    test_removeDriveFileWithCompatibility_readerOnlyReportsNoAccess,
    test_removeDriveFileWithCompatibility_notFoundIsIdempotent,
    test_archiveDriveFileWithCompatibility_usesFourArgUpdate,
    test_archiveDriveFileWithCompatibility_legacySignatureFallback,
    test_escalation_sharedDriveTakesOrganizerThenDeletes,
    test_escalation_restoresPreviousRoleOnRelease,
    test_escalation_leavesPreExistingOrganizerAlone,
    test_escalation_myDriveUsesOwnerImpersonation,
    test_escalation_myDriveWithoutDelegationReportsRemedy,
    test_escalation_refusesExternalDomainOwner,
    test_buildServiceAccountJwt_shapeAndClaims,
    test_deleteDriveFileAsOwner_mapsHttpStatuses,
    test_normalizePrivateKey_unescapesNewlines,
    test_isSameDomainEmail_,
    test_isSharedDriveAccessError_membership403,
    test_isSharedDriveAccessError_ignoresNonPermissionFailures,
    test_fetchDriveFilesWithPagination_usesDriveCorporaAndPaginates,
    test_scanSharedDriveFiles_memberDriveNeedsNoEscalation,
    test_scanSharedDriveFiles_membership403EscalatesThenLists,
    test_scanSharedDriveFiles_doesNotEscalateNonPermissionErrors,
    test_scanSharedDriveFiles_respectsEscalationCap,
    test_scanSharedDriveFiles_rethrowsWhenGrantNeverPropagates,
    test_listDomainSharedDrives_reportsEnumerationFailure,
    test_chineseNumeralToInt_basic,
    test_buildUserSortKey_ordersByClassThenNumber,
    test_buildUserSortKey_handlesMissingName
  ];

  let passCount = 0;
  const failures = [];

  tests.forEach(testFn => {
    try {
      testFn();
      passCount++;
    } catch (e) {
      failures.push(`${testFn.name}: ${e.message}`);
    }
  });

  const summary = `Batch tests passed ${passCount}/${tests.length}.`;
  if (failures.length > 0) {
    throw new Error(`${summary}\n${failures.join("\n")}`);
  }
  return summary;
}

function test_detectDelimiter_csv() {
  assertEqual_(detectBatchDelimiter_("courses.csv", "name,teacherEmail\nA,a@example.edu"), ",", "CSV delimiter");
}

function test_detectDelimiter_tsv() {
  assertEqual_(detectBatchDelimiter_("courses.tsv", "name\tteacherEmail\nA\ta@example.edu"), "\t", "TSV delimiter");
}

function test_mapHeaderIndexes_aliases() {
  const map = mapCourseBatchHeaderIndexes_(["Course Name", "Period", "Instructor Email", "Desc"]);
  assertEqual_(map.name, 0, "Alias map name");
  assertEqual_(map.section, 1, "Alias map section");
  assertEqual_(map.teacherEmail, 2, "Alias map teacherEmail");
  assertEqual_(map.description, 3, "Alias map description");
}

function test_mapHeaderIndexes_missingRequiredTeacherEmail() {
  assertThrows_(
    function() {
      mapCourseBatchHeaderIndexes_(["name", "section", "description"]);
    },
    "teacherEmail",
    "Missing required teacherEmail"
  );
}

function test_validateBatchRow_missingTeacherEmail() {
  const result = validateBatchCourseRow_({
    name: "Math",
    section: "A",
    teacherEmail: "",
    description: ""
  });
  assertFalse_(result.valid, "Row should be invalid when teacherEmail is missing.");
}

function test_validateBatchRow_invalidTeacherEmail() {
  const result = validateBatchCourseRow_({
    name: "Math",
    section: "A",
    teacherEmail: "not-an-email",
    description: ""
  });
  assertFalse_(result.valid, "Row should be invalid for malformed teacherEmail.");
}

function test_enforceBatchLimit_over100() {
  assertThrows_(
    function() {
      assertBatchRowLimit_(101);
    },
    "row limit",
    "Row limit should reject values above 100"
  );
}

function test_buildCourseKey_normalization() {
  const a = buildCourseKey_("  Math  7A ", " Spring 2026 ");
  const b = buildCourseKey_("math 7a", "spring 2026");
  assertEqual_(a, b, "Course key should normalize case/whitespace.");
}

function test_buildAndParseMultipart() {
  const operations = [{
    contentId: "create-row-2",
    method: "POST",
    path: "/v1/courses",
    body: { name: "Math 7A" }
  }];
  const requestBody = buildBatchMultipartRequest_(operations, "batch_req");
  assertTrue_(requestBody.indexOf("POST /v1/courses HTTP/1.1") !== -1, "Request should include path-only method line.");
  assertTrue_(requestBody.indexOf("Content-ID: <create-row-2>") !== -1, "Request should include content ID.");

  const responseBody = [
    "--batch_res",
    "Content-Type: application/http",
    "Content-ID: <response-create-row-2>",
    "",
    "HTTP/1.1 200 OK",
    "Content-Type: application/json; charset=UTF-8",
    "",
    '{"id":"course_2","name":"Math 7A"}',
    "--batch_res--"
  ].join("\r\n");

  const parsed = parseBatchMultipartResponse_(responseBody, "multipart/mixed; boundary=batch_res");
  assertEqual_(parsed.length, 1, "Should parse one multipart response item.");
  assertEqual_(parsed[0].contentId, "create-row-2", "Content-ID should normalize response prefix.");
  assertEqual_(parsed[0].statusCode, 200, "Parsed response status code.");
  assertEqual_(parsed[0].body.id, "course_2", "Parsed response JSON body.");
}

function test_executeBatchOperations_chunking() {
  let fetchCount = 0;

  const fakeFetch = function(url, options) {
    fetchCount++;
    const boundaryMatch = /boundary=([^;]+)/i.exec(options.contentType || "");
    const boundary = boundaryMatch ? boundaryMatch[1] : "batch_resp";
    const ids = extractContentIdsFromPayload_(options.payload || "");

    const parts = ids.map(id => [
      `--${boundary}`,
      "Content-Type: application/http",
      `Content-ID: <response-${id}>`,
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json; charset=UTF-8",
      "",
      `{"id":"${id}"}`,
      ""
    ].join("\r\n")).join("");

    return createFakeResponse_(
      200,
      { "Content-Type": `multipart/mixed; boundary=${boundary}` },
      `${parts}--${boundary}--`
    );
  };

  const operations = [];
  for (let i = 0; i < 100; i++) {
    operations.push({
      contentId: `create-row-${i + 2}`,
      method: "POST",
      path: "/v1/courses",
      body: { name: `Course ${i}` }
    });
  }

  const results = executeBatchOperations_(operations, fakeFetch);
  assertEqual_(fetchCount, 2, "100 requests should be split into 2 batch calls (50 each).");
  assertEqual_(results.length, 100, "Each operation should return one result.");
  assertTrue_(results.every(r => r.ok), "All fake responses should be successful.");
}

function test_runCourseBatchPhases_continueOnError() {
  const rows = [
    { rowNumber: 2, name: "Math", section: "A", teacherEmail: "teacher1@example.edu", description: "" },
    { rowNumber: 3, name: "Science", section: "B", teacherEmail: "teacher2@example.edu", description: "" }
  ];

  const executor = function(operations) {
    return operations.map(op => {
      if (op.contentId === "create-row-2") {
        return {
          contentId: op.contentId,
          ok: true,
          statusCode: 200,
          message: "OK",
          body: { id: "c2", name: "Math", section: "A", ownerId: "me", enrollmentCode: "E2" }
        };
      }
      if (op.contentId === "create-row-3") {
        return {
          contentId: op.contentId,
          ok: true,
          statusCode: 200,
          message: "OK",
          body: { id: "c3", name: "Science", section: "B", ownerId: "me", enrollmentCode: "E3" }
        };
      }
      if (op.contentId === "teacher-row-2") {
        return { contentId: op.contentId, ok: true, statusCode: 200, message: "OK", body: {} };
      }
      if (op.contentId === "teacher-row-3") {
        return {
          contentId: op.contentId,
          ok: false,
          statusCode: 403,
          message: "Permission denied",
          body: { error: { message: "Permission denied" } }
        };
      }
      return { contentId: op.contentId, ok: false, statusCode: 500, message: "Unexpected", body: null };
    });
  };

  const result = runCourseBatchPhases_(rows, executor);
  assertEqual_(result.createdRecords.length, 2, "Courses created in phase 1 should be returned even with teacher errors.");
  assertEqual_(result.createdRecords.filter(r => r.teacherAssigned).length, 1, "Only one row should have successful teacher assignment.");
  assertEqual_(result.errors.length, 1, "Teacher assignment failure should be reported as one error.");
  assertEqual_(result.errors[0].stage, "ADD_TEACHER", "Error stage should indicate teacher assignment.");
  assertEqual_(result.errors[0].rowNumber, 3, "Teacher assignment failure should point to row 3.");
}

function test_getCourseBatchTemplate_csv_tsv() {
  const csv = getCourseBatchTemplate("csv");
  const tsv = getCourseBatchTemplate("tsv");
  assertTrue_(csv.filename.endsWith(".csv"), "CSV template filename.");
  assertTrue_(tsv.filename.endsWith(".tsv"), "TSV template filename.");
  assertTrue_(csv.content.indexOf("teacherEmail") !== -1, "CSV template should include required headers.");
  assertTrue_(tsv.content.indexOf("\t") !== -1, "TSV template should use tab delimiter.");
}

function test_buildBatchCreateLogDetail_includesPartialTeacherFailure() {
  const detail = buildBatchCreateLogDetail_({
    summary: { totalRows: 2, created: 1, partial: 1, skipped: 0, errors: 1 },
    created: [{
      rowNumber: 3,
      courseId: "c3",
      teacherEmail: "teacher2@example.edu",
      teacherStatus: "FAILED",
      teacherError: "Permission denied"
    }]
  });
  assertTrue_(detail.indexOf("Partial details:") !== -1, "Log detail should include partial details section.");
  assertTrue_(detail.indexOf("row 3") !== -1, "Log detail should include failed row number.");
  assertTrue_(detail.indexOf("Permission denied") !== -1, "Log detail should include teacher assignment failure reason.");
}

function test_mapGroupHeaderIndexes_aliases() {
  const map = mapGroupBatchHeaderIndexes_(["Group Email", "Display Name", "Desc"]);
  assertEqual_(map.email, 0, "Alias map email");
  assertEqual_(map.name, 1, "Alias map name");
  assertEqual_(map.description, 2, "Alias map description");
}

function test_mapGroupHeaderIndexes_missingRequiredEmail() {
  assertThrows_(
    function() {
      mapGroupBatchHeaderIndexes_(["name", "description"]);
    },
    "email",
    "Missing required email header should fail."
  );
}

function test_validateBatchGroupRow_invalidEmail() {
  const result = validateBatchGroupRow_({
    email: "bad-address",
    name: "Math Team",
    description: ""
  });
  assertFalse_(result.valid, "Group row should be invalid for malformed group email.");
}

function test_normalizeGroupMemberRole_invalid() {
  assertEqual_(normalizeGroupMemberRole_("owner"), "OWNER", "Role normalization should uppercase valid roles.");
  assertThrows_(
    function() {
      normalizeGroupMemberRole_("admin");
    },
    "Invalid group member role",
    "Invalid role should throw."
  );
}

function test_getGroupBatchTemplate_csv_tsv() {
  const csv = getGroupBatchTemplate("csv");
  const tsv = getGroupBatchTemplate("tsv");
  assertTrue_(csv.filename.endsWith(".csv"), "CSV group template filename.");
  assertTrue_(tsv.filename.endsWith(".tsv"), "TSV group template filename.");
  assertTrue_(csv.content.indexOf("email") !== -1, "Group template should include email header.");
  assertTrue_(tsv.content.indexOf("\t") !== -1, "TSV template should use tab delimiter.");
}

function test_buildGroupBatchCreateLogDetail_includesPreview() {
  const detail = buildGroupBatchCreateLogDetail_({
    jobId: "job-1",
    summary: { totalRows: 3, attemptedRows: 2, created: 1, skipped: 1, errors: 1 },
    errors: [{
      rowNumber: 4,
      message: "Entity already exists."
    }]
  });
  assertTrue_(detail.indexOf("Job job-1") !== -1, "Group batch detail should include job ID.");
  assertTrue_(detail.indexOf("row 4") !== -1, "Group batch detail should include error row.");
}

function test_buildGroupMemberAssignLogDetail_includesPreview() {
  const detail = buildGroupMemberAssignLogDetail_({
    jobId: "job-2",
    summary: { totalAssignments: 4, targetGroups: 2, selectedMembers: 2, added: 3, skipped: 0, errors: 1 },
    errors: [{
      groupEmail: "teachers@example.edu",
      memberEmail: "user@example.edu",
      message: "Resource not found."
    }]
  });
  assertTrue_(detail.indexOf("Job job-2") !== -1, "Assignment detail should include job ID.");
  assertTrue_(detail.indexOf("teachers@example.edu") !== -1, "Assignment detail should include group email.");
}

function test_removeDriveFileWithCompatibility_prefersDelete() {
  let deleteCalled = 0;
  let removeCalled = 0;
  const fakeApi = {
    delete: function() { deleteCalled++; },
    remove: function() { removeCalled++; }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(result.mode, "DELETED", "Delete result mode should be DELETED.");
  assertEqual_(deleteCalled, 1, "Compatibility delete should call delete() first when available.");
  assertEqual_(removeCalled, 0, "Remove fallback should not be used when delete succeeds.");
}

function test_removeDriveFileWithCompatibility_usesRemoveFallback() {
  let removeCalled = 0;
  const fakeApi = {
    remove: function() { removeCalled++; }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(result.mode, "DELETED", "Delete result mode should be DELETED.");
  assertEqual_(removeCalled, 1, "Compatibility delete should fallback to remove() when delete() is unavailable.");
}

function test_removeDriveFileWithCompatibility_permissionFallbackToTrash() {
  let deleteCalled = 0;
  let updateCalled = 0;
  const fakeApi = {
    delete: function() {
      deleteCalled++;
      throw new Error("insufficientFilePermissions: organizer role required");
    },
    update: function() {
      updateCalled++;
    }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(deleteCalled, 1, "Delete should be attempted once.");
  assertEqual_(updateCalled, 1, "Trash fallback should call update(trashed=true).");
  assertEqual_(result.mode, "TRASHED", "Permission error should fallback to trash.");
}

/**
 * Reproduces the exact exception observed in production Cloud Logs (v2.5.0):
 * a GoogleJsonResponseException whose message is localized to zh-TW and whose
 * only machine-readable 403 lives on `.details`.
 */
function createLocalizedDrivePermissionError_() {
  const err = new Error(
    "drive.files.delete API 呼叫失敗 (錯誤訊息：The user does not have sufficient permissions for this file.)"
  );
  err.name = "GoogleJsonResponseException";
  err.details = {
    message: "The user does not have sufficient permissions for this file.",
    errors: [{ domain: "global", reason: "insufficientFilePermissions", message: "The user does not have sufficient permissions for this file." }],
    code: 403
  };
  return err;
}

function createDriveNotFoundError_() {
  const err = new Error("drive.files.delete API 呼叫失敗 (錯誤訊息：File not found: abc123.)");
  err.name = "GoogleJsonResponseException";
  err.details = {
    message: "File not found: abc123.",
    errors: [{ domain: "global", reason: "notFound", message: "File not found: abc123." }],
    code: 404
  };
  return err;
}

function test_isDeletePermissionError_localizedGoogleJsonResponseException() {
  assertTrue_(
    isDeletePermissionError_(createLocalizedDrivePermissionError_()),
    "Localized zh-TW 403 GoogleJsonResponseException must be classified as a permission error."
  );
}

function test_isDeletePermissionError_structuredCodeAndReason() {
  const codeOnly = new Error("完全在地化的訊息，沒有任何英文關鍵字。");
  codeOnly.details = { code: 403, errors: [] };
  assertTrue_(isDeletePermissionError_(codeOnly), "details.code 403 alone must classify as permission error.");

  const reasonOnly = new Error("opaque failure");
  reasonOnly.details = { errors: [{ reason: "cannotDelete" }] };
  assertTrue_(isDeletePermissionError_(reasonOnly), "details.errors[].reason alone must classify as permission error.");
}

function test_isDeletePermissionError_ignoresUnrelatedErrors() {
  const rateLimit = new Error("Rate Limit Exceeded");
  rateLimit.details = { code: 429, errors: [{ reason: "rateLimitExceeded" }] };
  assertFalse_(isDeletePermissionError_(rateLimit), "429 rate limit must NOT be treated as a permission error.");

  const idWith403 = new Error("Error processing 1yGOvlC8xDRZk3nksIO403EVIH7W9Hmm6");
  assertFalse_(
    isDeletePermissionError_(idWith403),
    "A file ID containing 403 must not be misread as an HTTP status."
  );
}

function test_isDriveNotFoundError_detects404() {
  assertTrue_(isDriveNotFoundError_(createDriveNotFoundError_()), "404 notFound must be detected.");
  assertFalse_(isDriveNotFoundError_(createLocalizedDrivePermissionError_()), "403 must not be read as notFound.");
}

function test_removeDriveFileWithCompatibility_localized403FallsBackToTrash() {
  let deleteCalled = 0;
  let updateCalled = 0;
  let updateArgCount = 0;
  const fakeApi = {
    delete: function() { deleteCalled++; throw createLocalizedDrivePermissionError_(); },
    update: function() { updateCalled++; updateArgCount = arguments.length; }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(deleteCalled, 1, "Permanent delete should be attempted once.");
  assertEqual_(updateCalled, 1, "Localized 403 must trigger the trash fallback.");
  assertEqual_(updateArgCount, 4, "Trash fallback must use the 4-arg update signature.");
  assertEqual_(result.mode, "TRASHED", "Localized 403 must resolve to TRASHED, not a thrown error.");
}

function test_removeDriveFileWithCompatibility_readerOnlyReportsNoAccess() {
  const fakeApi = {
    delete: function() { throw createLocalizedDrivePermissionError_(); },
    update: function() { throw createLocalizedDrivePermissionError_(); }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(result.mode, "NO_ACCESS", "Reader-only access must report NO_ACCESS instead of throwing.");
  assertTrue_(result.message.indexOf("檢視者") !== -1, "NO_ACCESS note should explain the reader-only cause.");
}

function test_removeDriveFileWithCompatibility_notFoundIsIdempotent() {
  let updateCalled = 0;
  const fakeApi = {
    delete: function() { throw createDriveNotFoundError_(); },
    update: function() { updateCalled++; }
  };
  const result = removeDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(result.mode, "ALREADY_GONE", "404 should be treated as already deleted.");
  assertEqual_(updateCalled, 0, "404 must not trigger the trash fallback.");
}

function test_archiveDriveFileWithCompatibility_usesFourArgUpdate() {
  let argCount = 0;
  let newName = "";
  let optionalArgs = null;
  const fakeApi = {
    get: function() { return { id: "abc123", name: "Old Report.pdf" }; },
    update: function(resource, fileId, mediaData, opts) {
      argCount = arguments.length;
      newName = resource.name;
      optionalArgs = opts;
    }
  };
  archiveDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(argCount, 4, "Archive must call update with the 4-arg v3 signature.");
  assertEqual_(newName, "[ARCHIVED]_Old Report.pdf", "Archive should prefix the existing name.");
  assertTrue_(optionalArgs && optionalArgs.supportsAllDrives === true, "supportsAllDrives must reach optionalArgs, not mediaData.");
}

function test_archiveDriveFileWithCompatibility_legacySignatureFallback() {
  let legacyCallArgCount = 0;
  let attempts = 0;
  const fakeApi = {
    get: function() { return { id: "abc123", name: "Old.pdf" }; },
    update: function() {
      attempts++;
      if (attempts === 1) throw new Error("Invalid number of arguments provided.");
      legacyCallArgCount = arguments.length;
    }
  };
  archiveDriveFileWithCompatibility_("abc123", fakeApi);
  assertEqual_(attempts, 2, "Archive should retry once on a method-signature error.");
  assertEqual_(legacyCallArgCount, 3, "Legacy fallback should use the 3-arg update signature.");
}

// --- Drive delete escalation (Option A shared drive / Option B1 delegation) ---

function createEscalationContext_(overrides) {
  const ctx = createDriveEscalationContext_();
  ctx.adminEmail = "admin@school.edu";
  ctx.delegationAvailable = false;
  ctx.grantedDrives = [];
  ctx.driveAdminDeletes = 0;
  ctx.ownerDeletes = 0;
  ctx.notes = [];
  Object.keys(overrides || {}).forEach(k => { ctx[k] = overrides[k]; });
  return ctx;
}

function createSimpleHttpResponse_(code, body) {
  return {
    getResponseCode: function() { return code; },
    getContentText: function() { return body || ""; }
  };
}

/**
 * Injected service-account credentials + signer. Unit tests must never read the
 * real Script Properties (an unconfigured project would fail the suite) and must
 * never call Utilities.computeRsaSha256Signature (it needs a genuine RSA PEM and
 * throws "Invalid argument: key" otherwise).
 */
function createFakeDelegationDeps_(extra) {
  const deps = {
    creds: { email: "sa@proj.iam.gserviceaccount.com", key: "TEST-KEY-NOT-A-REAL-PEM" },
    signFn: function(signingInput) {
      return Utilities.newBlob(`sig(${signingInput.length})`).getBytes();
    }
  };
  Object.keys(extra || {}).forEach(k => { deps[k] = extra[k]; });
  return deps;
}

function test_escalation_sharedDriveTakesOrganizerThenDeletes() {
  let deleteAttempts = 0;
  let createdRole = "";
  const deps = {
    filesApi: {
      get: function() { return { id: "f1", name: "Old.pdf", driveId: "drive-1", owners: [] }; },
      // Denies the delete until the organizer grant has actually been made —
      // this is what proves the escalation, not just the retry, is what works.
      delete: function() {
        deleteAttempts++;
        if (createdRole !== "organizer") throw createLocalizedDrivePermissionError_();
      }
    },
    permissionsApi: {
      list: function() { return { permissions: [] }; },
      create: function(resource) { createdRole = resource.role; return { id: "perm-9" }; },
      update: function() { throw new Error("update should not be called"); },
      remove: function() {}
    }
  };
  const ctx = createEscalationContext_();
  const result = escalateDriveFileRemoval_("f1", ctx, deps);

  assertEqual_(createdRole, "organizer", "Escalation should grant the organizer role.");
  assertEqual_(result.mode, "DELETED_AS_DRIVE_ADMIN", "Shared drive item should delete after escalation.");
  assertEqual_(ctx.driveAdminDeletes, 1, "Drive-admin delete counter should increment.");
  assertEqual_(ctx.grantedDrives.length, 1, "Grant should be tracked for later release.");
  assertTrue_(ctx.grantedDrives[0].created === true, "Newly created grant must be flagged for removal.");
}

function test_escalation_restoresPreviousRoleOnRelease() {
  let restoredRole = "";
  let removeCalled = 0;
  const deps = {
    permissionsApi: {
      update: function(resource) { restoredRole = resource.role; },
      remove: function() { removeCalled++; }
    }
  };
  const ctx = createEscalationContext_({
    grantedDrives: [{ driveId: "drive-1", permissionId: "perm-3", previousRole: "fileOrganizer" }]
  });
  releaseDriveEscalationContext_(ctx, deps);

  assertEqual_(restoredRole, "fileOrganizer", "Release must restore the admin's original lower role.");
  assertEqual_(removeCalled, 0, "A pre-existing permission must never be deleted outright.");
}

function test_escalation_leavesPreExistingOrganizerAlone() {
  let mutations = 0;
  const deps = {
    permissionsApi: {
      list: function() {
        return { permissions: [{ id: "perm-1", role: "organizer", type: "user", emailAddress: "admin@school.edu" }] };
      },
      create: function() { mutations++; return { id: "x" }; },
      update: function() { mutations++; },
      remove: function() { mutations++; }
    }
  };
  const ctx = createEscalationContext_();
  grantSelfSharedDriveOrganizer_("drive-1", ctx, deps);
  releaseDriveEscalationContext_(ctx, deps);

  assertEqual_(mutations, 0, "Existing organizer access must be neither re-granted nor revoked.");
  assertTrue_(ctx.grantedDrives[0].preExisting === true, "Pre-existing access should be flagged.");
}

function test_escalation_myDriveUsesOwnerImpersonation() {
  let tokenSubject = "";
  let deletedUrl = "";
  const deps = createFakeDelegationDeps_({
    filesApi: {
      get: function() {
        return { id: "f2", name: "Report.pdf", driveId: null, owners: [{ emailAddress: "teacher@school.edu" }] };
      }
    },
    fetchFn: function(url, params) {
      if (url.indexOf("oauth2.googleapis.com") !== -1) {
        const claim = JSON.parse(
          Utilities.newBlob(Utilities.base64DecodeWebSafe(params.payload.assertion.split(".")[1])).getDataAsString()
        );
        tokenSubject = claim.sub;
        return createSimpleHttpResponse_(200, JSON.stringify({ access_token: "tok-123" }));
      }
      deletedUrl = url;
      assertEqual_(params.headers.Authorization, "Bearer tok-123", "Delete must use the impersonated token.");
      return createSimpleHttpResponse_(204, "");
    }
  });
  const ctx = createEscalationContext_({ delegationAvailable: true });
  const result = escalateDriveFileRemoval_("f2", ctx, deps);

  assertEqual_(tokenSubject, "teacher@school.edu", "JWT sub must be the file's owner, not the admin.");
  assertTrue_(deletedUrl.indexOf("/files/f2") !== -1, "Delete should target the file id.");
  assertEqual_(result.mode, "DELETED_AS_OWNER", "My Drive item should delete as its owner.");
  assertEqual_(ctx.ownerDeletes, 1, "Owner-delete counter should increment.");
}

function test_escalation_myDriveWithoutDelegationReportsRemedy() {
  const deps = {
    filesApi: {
      get: function() { return { id: "f3", driveId: null, owners: [{ emailAddress: "teacher@school.edu" }] }; }
    }
  };
  const ctx = createEscalationContext_({ delegationAvailable: false });
  const result = escalateDriveFileRemoval_("f3", ctx, deps);

  assertEqual_(result.mode, "NO_ACCESS", "Without delegation the item stays un-deletable.");
  assertTrue_(
    result.message.indexOf("setDriveDelegationCredentials") !== -1,
    "The remedy should name the setup function."
  );
}

function test_escalation_refusesExternalDomainOwner() {
  let fetchCalled = 0;
  const deps = createFakeDelegationDeps_({
    filesApi: {
      get: function() { return { id: "f4", driveId: null, owners: [{ emailAddress: "outsider@other.com" }] }; }
    },
    fetchFn: function() { fetchCalled++; return createSimpleHttpResponse_(200, "{}"); }
  });
  const ctx = createEscalationContext_({ delegationAvailable: true });
  const result = escalateDriveFileRemoval_("f4", ctx, deps);

  assertEqual_(result.mode, "NO_ACCESS", "External-domain owners cannot be impersonated.");
  assertEqual_(fetchCalled, 0, "No token should be minted for an out-of-domain subject.");
}

function test_buildServiceAccountJwt_shapeAndClaims() {
  const fake = createFakeDelegationDeps_();
  const jwt = buildServiceAccountJwt_(fake.creds, "teacher@school.edu", 1700000000, fake.signFn);
  const segments = jwt.split(".");
  assertEqual_(segments.length, 3, "A JWT must have three dot-separated segments.");
  assertFalse_(jwt.indexOf("=") !== -1, "Base64url segments must not carry '=' padding.");

  const header = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(segments[0])).getDataAsString());
  const claim = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(segments[1])).getDataAsString());
  assertEqual_(header.alg, "RS256", "Google requires RS256 for service account assertions.");
  assertEqual_(claim.iss, "sa@proj.iam.gserviceaccount.com", "iss must be the service account.");
  assertEqual_(claim.sub, "teacher@school.edu", "sub must be the impersonated user.");
  assertEqual_(claim.aud, "https://oauth2.googleapis.com/token", "aud must be the token endpoint.");
  assertEqual_(claim.exp - claim.iat, 3600, "Assertion lifetime must be one hour.");
}

function test_deleteDriveFileAsOwner_mapsHttpStatuses() {
  const respond = code => createFakeDelegationDeps_({
    fetchFn: function(url) {
      if (url.indexOf("oauth2.googleapis.com") !== -1) {
        return createSimpleHttpResponse_(200, JSON.stringify({ access_token: "t" }));
      }
      return createSimpleHttpResponse_(code, JSON.stringify({ error: { message: "boom" } }));
    }
  });

  assertEqual_(deleteDriveFileAsOwner_("f", "u@school.edu", respond(204)).mode, "DELETED_AS_OWNER", "204 -> deleted.");
  assertEqual_(deleteDriveFileAsOwner_("f", "u@school.edu", respond(404)).mode, "ALREADY_GONE", "404 -> already gone.");
  assertEqual_(deleteDriveFileAsOwner_("f", "u@school.edu", respond(403)).mode, "NO_ACCESS", "403 -> no access.");
  assertThrows_(
    function() { deleteDriveFileAsOwner_("f", "u@school.edu", respond(500)); },
    "HTTP 500",
    "A 5xx should surface as a hard error, not a silent skip."
  );
}

function test_normalizePrivateKey_unescapesNewlines() {
  const escaped = "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----";
  const normalized = normalizePrivateKey_(escaped);
  assertTrue_(normalized.indexOf("\\n") === -1, "Literal \\n sequences must be converted to real newlines.");
  assertTrue_(normalized.split("\n").length === 3, "Normalized PEM should span three lines.");
}

function test_isSameDomainEmail_() {
  assertTrue_(isSameDomainEmail_("a@school.edu", "b@SCHOOL.edu"), "Domain compare should be case-insensitive.");
  assertFalse_(isSameDomainEmail_("a@school.edu", "b@other.com"), "Different domains must not match.");
  assertFalse_(isSameDomainEmail_("", "b@school.edu"), "Empty address must not match.");
}

function createFakeResponse_(statusCode, headers, body) {
  return {
    getResponseCode: function() { return statusCode; },
    getAllHeaders: function() { return headers; },
    getContentText: function() { return body; }
  };
}

function extractContentIdsFromPayload_(payload) {
  const ids = [];
  const regex = /Content-ID:\s*<([^>]+)>/g;
  let match;
  while ((match = regex.exec(String(payload || ""))) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/* =========================================
   v2.6.2 — Shared drive audit sweep regression tests

   Production error being pinned down (v2.6.1, findOutdatedFiles):
     Shared drive scan failed for 0ANaIjkThat-yUk9PVA
     GoogleJsonResponseException: drive.files.list API 呼叫失敗
     (錯誤訊息：The attempted action requires shared drive membership.) code: 403

   Drives.list({useDomainAdminAccess:true}) returns drives the admin is NOT a
   member of, but files.list has no useDomainAdminAccess parameter and is
   membership-gated. Every one of these tests injects fakes — no Script
   Properties, no crypto, no live API.
   ========================================= */

function createSharedDriveMembershipError_() {
  const err = new Error(
    "drive.files.list API 呼叫失敗 (錯誤訊息：The attempted action requires shared drive membership.)"
  );
  err.name = "GoogleJsonResponseException";
  err.details = {
    message: "The attempted action requires shared drive membership.",
    errors: [{
      domain: "global",
      reason: "sharedDriveMembershipRequired",
      message: "The attempted action requires shared drive membership."
    }],
    code: 403
  };
  return err;
}

/** Escalation context literal — avoids Session/Script Properties in tests. */
function createFakeAuditEscalationContext_() {
  return {
    adminEmail: "admin@example.edu",
    delegationAvailable: false,
    grantedDrives: [],
    driveAdminDeletes: 0,
    ownerDeletes: 0,
    notes: []
  };
}

function test_isSharedDriveAccessError_membership403() {
  assertTrue_(
    isSharedDriveAccessError_(createSharedDriveMembershipError_()),
    "403 shared drive membership error must be classified as escalatable."
  );

  const reasonOnly = new Error("完全在地化訊息");
  reasonOnly.details = { errors: [{ reason: "teamDriveMembershipRequired" }] };
  assertTrue_(
    isSharedDriveAccessError_(reasonOnly),
    "Legacy teamDriveMembershipRequired reason must also be escalatable."
  );
}

function test_isSharedDriveAccessError_ignoresNonPermissionFailures() {
  assertFalse_(
    isSharedDriveAccessError_(createDriveNotFoundError_()),
    "404 must not trigger a permission escalation."
  );

  const rateLimit = new Error("Rate Limit Exceeded");
  rateLimit.details = { code: 429, errors: [{ reason: "rateLimitExceeded" }] };
  assertFalse_(isSharedDriveAccessError_(rateLimit), "429 must not trigger escalation.");

  const serverError = new Error("Internal error");
  serverError.details = { code: 500, errors: [] };
  assertFalse_(isSharedDriveAccessError_(serverError), "500 must not trigger escalation.");
}

function test_fetchDriveFilesWithPagination_usesDriveCorporaAndPaginates() {
  const seenParams = [];
  const fakeFilesApi = {
    list: function (params) {
      seenParams.push(params);
      if (seenParams.length === 1) {
        return { files: [{ id: "f1" }, { id: "f2" }], nextPageToken: "page2" };
      }
      return { files: [{ id: "f3" }], nextPageToken: null };
    }
  };

  const items = fetchDriveFilesWithPagination_("trashed = false", 10, "drive-1", { filesApi: fakeFilesApi });

  assertEqual_(items.length, 3, "Pagination should follow nextPageToken and merge pages.");
  assertEqual_(seenParams.length, 2, "Two pages should require two list calls.");
  assertEqual_(seenParams[0].corpora, "drive", "A shared drive scan must use corpora='drive'.");
  assertEqual_(seenParams[0].driveId, "drive-1", "driveId must be passed for a shared drive scan.");
  assertTrue_(seenParams[0].supportsAllDrives === true, "supportsAllDrives must always be set.");
  assertEqual_(seenParams[1].pageToken, "page2", "Second call must carry the page token.");
  assertTrue_(
    seenParams[0].useDomainAdminAccess === undefined,
    "files.list has no useDomainAdminAccess parameter — sending it would be an Invalid Value error."
  );
}

function test_scanSharedDriveFiles_memberDriveNeedsNoEscalation() {
  let permissionCalls = 0;
  const ctx = createFakeAuditEscalationContext_();
  const deps = {
    filesApi: { list: function () { return { files: [{ id: "f1" }], nextPageToken: null }; } },
    permissionsApi: {
      list: function () { permissionCalls++; return { permissions: [] }; },
      create: function () { permissionCalls++; return { id: "p1" }; }
    },
    sleepFn: function () {}
  };

  const result = scanSharedDriveFiles_("drive-1", "trashed = false", 50, ctx, deps);

  assertEqual_(result.items.length, 1, "A drive the admin can already read must return its files.");
  assertFalse_(result.escalated, "No escalation should be reported for a readable drive.");
  assertEqual_(permissionCalls, 0, "A readable drive must never have its ACL touched.");
  assertEqual_(ctx.grantedDrives.length, 0, "No grant should be recorded for a readable drive.");
}

function test_scanSharedDriveFiles_membership403EscalatesThenLists() {
  let listAttempts = 0;
  let createdPermission = null;
  let sleptMs = 0;
  const ctx = createFakeAuditEscalationContext_();

  const deps = {
    filesApi: {
      list: function () {
        listAttempts++;
        if (listAttempts === 1) throw createSharedDriveMembershipError_();
        return { files: [{ id: "f1" }, { id: "f2" }], nextPageToken: null };
      }
    },
    permissionsApi: {
      list: function () { return { permissions: [] }; },
      create: function (resource) { createdPermission = resource; return { id: "perm-1" }; }
    },
    sleepFn: function (ms) { sleptMs += ms; }
  };

  const result = scanSharedDriveFiles_("0ANaIjkThat-yUk9PVA", "trashed = false", 50, ctx, deps);

  assertEqual_(listAttempts, 2, "The listing must be retried once the organizer grant is taken.");
  assertEqual_(result.items.length, 2, "Files behind the membership wall must be returned after escalation.");
  assertTrue_(result.escalated, "The result must flag that escalation was required.");
  assertTrue_(createdPermission && createdPermission.role === "organizer", "Escalation must request the organizer role.");
  assertEqual_(createdPermission.emailAddress, "admin@example.edu", "The grant must target the executing admin.");
  assertTrue_(sleptMs > 0, "A propagation delay must be observed before retrying.");
  assertEqual_(ctx.grantedDrives.length, 1, "The grant must be tracked so it can be released afterwards.");
  assertTrue_(ctx.grantedDrives[0].created === true, "A newly created grant must be marked for removal on release.");
}

function test_scanSharedDriveFiles_doesNotEscalateNonPermissionErrors() {
  let permissionCalls = 0;
  const ctx = createFakeAuditEscalationContext_();
  const deps = {
    filesApi: { list: function () { throw createDriveNotFoundError_(); } },
    permissionsApi: {
      list: function () { permissionCalls++; return { permissions: [] }; },
      create: function () { permissionCalls++; return { id: "p1" }; }
    },
    sleepFn: function () {}
  };

  assertThrows_(
    function () { scanSharedDriveFiles_("drive-1", "trashed = false", 50, ctx, deps); },
    "",
    "A 404 must propagate to the caller so it is counted as a coverage gap."
  );
  assertEqual_(permissionCalls, 0, "A 404 must never mutate a shared drive ACL.");
}

function test_scanSharedDriveFiles_respectsEscalationCap() {
  const ctx = createFakeAuditEscalationContext_();
  for (let i = 0; i < DRIVE_ESCALATION_CONFIG.MAX_SHARED_DRIVE_ESCALATIONS; i++) {
    ctx.grantedDrives.push({ driveId: `already-${i}`, permissionId: `p${i}`, created: true });
  }

  let permissionCalls = 0;
  const deps = {
    filesApi: { list: function () { throw createSharedDriveMembershipError_(); } },
    permissionsApi: {
      list: function () { permissionCalls++; return { permissions: [] }; },
      create: function () { permissionCalls++; return { id: "p" }; }
    },
    sleepFn: function () {}
  };

  assertThrows_(
    function () { scanSharedDriveFiles_("drive-new", "trashed = false", 50, ctx, deps); },
    "提權上限",
    "Exceeding the escalation cap must fail loudly instead of silently skipping."
  );
  assertEqual_(permissionCalls, 0, "No further ACL mutation may happen once the cap is reached.");
}

function test_scanSharedDriveFiles_rethrowsWhenGrantNeverPropagates() {
  let listAttempts = 0;
  const ctx = createFakeAuditEscalationContext_();
  const deps = {
    filesApi: {
      list: function () { listAttempts++; throw createSharedDriveMembershipError_(); }
    },
    permissionsApi: {
      list: function () { return { permissions: [] }; },
      create: function () { return { id: "perm-1" }; }
    },
    sleepFn: function () {}
  };

  assertThrows_(
    function () { scanSharedDriveFiles_("drive-1", "trashed = false", 50, ctx, deps); },
    "",
    "A drive that stays unreadable after escalation must throw, not report empty coverage."
  );
  assertEqual_(
    listAttempts,
    1 + DRIVE_ESCALATION_CONFIG.SHARED_DRIVE_GRANT_RETRIES,
    "Retries must be bounded by SHARED_DRIVE_GRANT_RETRIES."
  );
  assertEqual_(ctx.grantedDrives.length, 1, "The failed grant must still be tracked so release can clean it up.");
}

function test_listDomainSharedDrives_reportsEnumerationFailure() {
  const outcome = { error: "" };
  const drives = listDomainSharedDrives_({
    drivesApi: {
      list: function () {
        const err = new Error("Domain administrator access denied.");
        err.details = { code: 403, errors: [{ reason: "forbidden" }] };
        throw err;
      }
    }
  }, outcome);

  assertEqual_(drives.length, 0, "A failed enumeration returns no drives.");
  assertTrue_(outcome.error.length > 0, "Enumeration failure must be reported, not swallowed silently.");

  const okOutcome = { error: "" };
  const okDrives = listDomainSharedDrives_({
    drivesApi: {
      list: function () { return { drives: [{ id: "d1", name: "Staff" }], nextPageToken: null }; }
    }
  }, okOutcome);
  assertEqual_(okDrives.length, 1, "A successful enumeration returns its drives.");
  assertEqual_(okOutcome.error, "", "A successful enumeration must not report an error.");
}

function test_chineseNumeralToInt_basic() {
  assertEqual_(chineseNumeralToInt_("一"), 1, "一 -> 1");
  assertEqual_(chineseNumeralToInt_("五"), 5, "五 -> 5");
  assertEqual_(chineseNumeralToInt_("十"), 10, "十 -> 10");
  assertEqual_(chineseNumeralToInt_("十二"), 12, "十二 -> 12");
  assertEqual_(chineseNumeralToInt_("二十"), 20, "二十 -> 20");
  assertEqual_(chineseNumeralToInt_("二十一"), 21, "二十一 -> 21");
  assertTrue_(isNaN(chineseNumeralToInt_("莊")), "Non-numeral -> NaN");
}

function test_buildUserSortKey_ordersByClassThenNumber() {
  const names = [
    "2年二班11號莊明諺",
    "2年四班11號黃威丞",
    "2年五班18號劉祐菱",
    "2年二班14號沈亞臻",
    "2年三班11號許琇雯",
    "2年一班01號巫宥穎",
    "2年一班02號吳沛恩"
  ];
  const sorted = names.slice().sort(function (a, b) {
    return buildUserSortKey_(a).localeCompare(buildUserSortKey_(b), "zh-Hant");
  });
  const expected = [
    "2年一班01號巫宥穎",
    "2年一班02號吳沛恩",
    "2年二班11號莊明諺",
    "2年二班14號沈亞臻",
    "2年三班11號許琇雯",
    "2年四班11號黃威丞",
    "2年五班18號劉祐菱"
  ];
  assertEqual_(sorted.join("|"), expected.join("|"), "Names should sort by class (一二三四五) then seat number.");
}

function test_buildUserSortKey_handlesMissingName() {
  assertEqual_(buildUserSortKey_(""), "", "Empty name -> empty key.");
  assertEqual_(buildUserSortKey_(null), "", "Null name -> empty key.");
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed: expected true.");
}

function assertFalse_(condition, message) {
  if (condition) throw new Error(message || "Assertion failed: expected false.");
}

function assertEqual_(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Assertion failed"} (expected: ${expected}, actual: ${actual})`);
  }
}

function assertThrows_(fn, expectedMessageFragment, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    const text = String(e && e.message ? e.message : e);
    if (expectedMessageFragment && text.indexOf(expectedMessageFragment) === -1) {
      throw new Error(`${message || "Assertion failed"} (missing fragment: ${expectedMessageFragment}, actual: ${text})`);
    }
  }
  if (!threw) {
    throw new Error(message || "Assertion failed: expected function to throw.");
  }
}

/* ==================== v2.7.0: BULK USER UPDATE TESTS ==================== */

function test_mapUserBatchHeaderIndexes_aliases() {
  const map = mapUserBatchHeaderIndexes_(["Email Address [Required]", "First Name [Required]", "Last Name [Required]", "Org Unit Path [Required]", "New Status [UPLOAD ONLY]"]);
  assertEqual_(map.email, 0, "email index");
  assertEqual_(map.firstName, 1, "firstName index");
  assertEqual_(map.lastName, 2, "lastName index");
  assertEqual_(map.orgUnitPath, 3, "orgUnitPath index");
  assertEqual_(map.suspended, 4, "suspended index");
}

function test_mapUserBatchHeaderIndexes_shortAliases() {
  const map = mapUserBatchHeaderIndexes_(["primaryEmail", "givenName", "familyName", "ou"]);
  assertEqual_(map.email, 0, "email");
  assertEqual_(map.firstName, 1, "firstName");
  assertEqual_(map.lastName, 2, "lastName");
  assertEqual_(map.orgUnitPath, 3, "orgUnitPath");
}

function test_mapUserBatchHeaderIndexes_missingEmail() {
  assertThrows_(function () {
    mapUserBatchHeaderIndexes_(["firstName", "lastName"]);
  }, "Missing required column", "should require email column");
}

function test_mapUserBatchHeaderIndexes_noEditableColumn() {
  assertThrows_(function () {
    mapUserBatchHeaderIndexes_(["email"]);
  }, "at least one updatable column", "email alone is not enough");
}

function test_parseSuspendedValue_variants() {
  assertEqual_(parseSuspendedValue_("TRUE"), true, "TRUE");
  assertEqual_(parseSuspendedValue_("suspended"), true, "suspended");
  assertEqual_(parseSuspendedValue_("1"), true, "1");
  assertEqual_(parseSuspendedValue_("FALSE"), false, "FALSE");
  assertEqual_(parseSuspendedValue_("Active"), false, "Active");
  assertEqual_(parseSuspendedValue_("0"), false, "0");
  assertEqual_(parseSuspendedValue_("maybe"), null, "unrecognized");
  assertEqual_(parseSuspendedValue_(""), null, "empty");
}

function test_validateBatchUserRow_rejectsBadOu() {
  const result = validateBatchUserRow_({ email: "a@b.edu", orgUnitPath: "openid/學生" });
  assertFalse_(result.valid, "should be invalid");
  assertTrue_(result.errors.join(" ").indexOf("must start with") !== -1, "should explain leading slash");
}

function test_validateBatchUserRow_rejectsNoChange() {
  const result = validateBatchUserRow_({ email: "a@b.edu" });
  assertFalse_(result.valid, "row with no updatable value is invalid");
}

function test_assertUserBatchRowLimit_over600() {
  assertThrows_(function () {
    assertUserBatchRowLimit_(601);
  }, "600-row limit", "should enforce 600-row cap");
  // 518 is the real-world promotion batch size and must be accepted.
  assertUserBatchRowLimit_(518);
  assertUserBatchRowLimit_(600);
}

function test_buildUserBatchDiff_classifies() {
  const candidates = [
    { rowNumber: 2, email: "same@x.edu", firstName: "A", lastName: "B" },
    { rowNumber: 3, email: "change@x.edu", lastName: "6年一班01號" },
    { rowNumber: 4, email: "gone@x.edu", lastName: "Z" }
  ];
  const states = {
    "same@x.edu": { firstName: "A", lastName: "B", orgUnitPath: "/s", suspended: false },
    "change@x.edu": { firstName: "C", lastName: "5年一班01號", orgUnitPath: "/s", suspended: false },
    "gone@x.edu": null
  };
  const diff = buildUserBatchDiff_(candidates, states);
  assertEqual_(diff.unchanged.length, 1, "one unchanged");
  assertEqual_(diff.updates.length, 1, "one update");
  assertEqual_(diff.missing.length, 1, "one missing");
  assertEqual_(diff.updates[0].changes[0].field, "lastName", "field name");
  assertEqual_(diff.updates[0].changes[0].from, "5年一班01號", "from value");
  assertEqual_(diff.updates[0].changes[0].to, "6年一班01號", "to value");
}

function test_buildUserUpdatePayload_shapes() {
  const payload = buildUserUpdatePayload_([
    { field: "firstName", from: "a", to: "A" },
    { field: "lastName", from: "b", to: "B" },
    { field: "orgUnitPath", from: "/x", to: "/y" },
    { field: "suspended", from: "false", to: "true" }
  ]);
  assertEqual_(payload.name.givenName, "A", "givenName");
  assertEqual_(payload.name.familyName, "B", "familyName");
  assertEqual_(payload.orgUnitPath, "/y", "orgUnitPath");
  assertEqual_(payload.suspended, true, "suspended boolean");
}

function test_buildUserUpdatePayload_omitsUntouchedFields() {
  const payload = buildUserUpdatePayload_([{ field: "orgUnitPath", from: "/x", to: "/y" }]);
  assertTrue_(payload.name === undefined, "name must be absent when not changed");
  assertTrue_(payload.suspended === undefined, "suspended must be absent when not changed");
}

function test_parseUserBatchFile_skipsDuplicatesAndInvalid() {
  const content = [
    "email,lastName",
    "a@x.edu,6年一班01號",
    "a@x.edu,6年一班02號",
    "not-an-email,6年一班03號",
    ",,"
  ].join("\n");
  const parsed = parseUserBatchFile_("t.csv", content);
  assertEqual_(parsed.candidates.length, 1, "only first valid unique row kept");
  assertEqual_(parsed.skipped.length, 2, "duplicate + invalid email skipped");
}

function test_executeUserBatchChunk_retriesOn429() {
  let call = 0;
  const deps = {
    getToken: function () { return "tok"; },
    sleep: function () {},
    now: function () { return 0; },
    fetchAll: function (requests) {
      call++;
      if (call === 1) {
        return [
          createSimpleHttpResponse_(200, "{}"),
          createSimpleHttpResponse_(429, '{"error":{"message":"rate"}}')
        ];
      }
      return [createSimpleHttpResponse_(200, "{}")];
    }
  };
  const results = executeUserBatchChunk_([
    { email: "a@x.edu", payload: {} },
    { email: "b@x.edu", payload: {} }
  ], deps);
  assertEqual_(call, 2, "should retry once");
  assertTrue_(results[0].ok, "first ok");
  assertTrue_(results[1].ok, "second ok after retry");
}

function test_executeUserBatchChunk_reportsHardFailure() {
  const deps = {
    getToken: function () { return "tok"; },
    sleep: function () {},
    now: function () { return 0; },
    fetchAll: function () { return [createSimpleHttpResponse_(404, '{"error":{"message":"Resource Not Found"}}')]; }
  };
  const results = executeUserBatchChunk_([{ email: "gone@x.edu", payload: {} }], deps);
  assertFalse_(results[0].ok, "404 is a hard failure");
  assertTrue_(String(results[0].message).indexOf("Not Found") !== -1, "message surfaced");
}

function test_getUserBatchTemplate_hasNoPasswordColumn() {
  const csv = getUserBatchTemplate("csv");
  const header = csv.content.split("\n")[0];
  assertTrue_(header.indexOf("password") === -1 && header.indexOf("Password") === -1, "template must not contain a password column");
  assertTrue_(header.indexOf("email") !== -1, "template has email");
  const tsv = getUserBatchTemplate("tsv");
  assertTrue_(tsv.content.split("\n")[0].indexOf("\t") !== -1, "tsv is tab separated");
}

/* ==================== v2.7.0: ROSTER + COURSE EDIT TESTS ==================== */

function test_mapRosterBatchHeaderIndexes_requiresCourseRef() {
  assertThrows_(function () {
    mapRosterBatchHeaderIndexes_(["studentEmail"]);
  }, "courseId column or a courseName", "needs a course reference");
}

function test_mapRosterBatchHeaderIndexes_acceptsCourseName() {
  const map = mapRosterBatchHeaderIndexes_(["courseName", "section", "studentEmail"]);
  assertEqual_(map.courseName, 0, "courseName");
  assertEqual_(map.section, 1, "section");
  assertEqual_(map.studentEmail, 2, "studentEmail");
}

function test_validateBatchRosterRow_invalidEmail() {
  const result = validateBatchRosterRow_({ courseId: "1", studentEmail: "nope" });
  assertFalse_(result.valid, "invalid email rejected");
}

function test_getCourseStudentBatchTemplate_csv() {
  const res = getCourseStudentBatchTemplate("csv");
  const header = res.content.split("\n")[0];
  assertTrue_(header.indexOf("studentEmail") !== -1, "has studentEmail");
  assertTrue_(header.indexOf("courseName") !== -1, "has courseName");
}

function test_previewCourseBulkEdit_rejectsBadField() {
  assertThrows_(function () {
    previewCourseBulkEdit(["1"], "ownerId", "SET", "x");
  }, "Field must be one of", "only whitelisted fields allowed");
}

function test_previewCourseBulkEdit_rejectsEmptySelection() {
  assertThrows_(function () {
    previewCourseBulkEdit([], "section", "SET", "x");
  }, "No courses selected", "requires a selection");
}
