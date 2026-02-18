/**
 * Unit tests for Classroom batch upload helpers.
 * Run `runBatchCourseUnitTests()` in Apps Script editor.
 */

function runBatchCourseUnitTests() {
  const tests = [
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
    test_removeDriveFileWithCompatibility_permissionFallbackToTrash
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
