/**
 * Offline unit tests for the v2.8.0 course materials Drive provisioning.
 * Run `runCourseDriveUnitTests()` in the Apps Script editor.
 *
 * Every test is dependency-injected: no Classroom, Drive, Sheets, Properties or
 * UrlFetch call is made, so the suite is safe to run in the live project and
 * cannot create a shared drive by accident.
 */

function runCourseDriveUnitTests() {
  const tests = [
    test_buildCourseDriveName_joinsAndTrims,
    test_buildCourseDriveName_fallsBackWhenEmpty,
    test_buildCourseDriveName_truncatesLongNames,
    test_buildCourseDriveRequestId_isDeterministic,
    test_buildCourseDriveRequestId_stripsUnsafeCharacters,
    test_normalizeCourseDriveMode_defaultsToSharedDrive,
    test_normalizeCourseDriveMode_acceptsShortcut,
    test_registryRowRoundTrip,
    test_classify_skipsAlreadyActive,
    test_classify_blocksWhenCourseGroupMissing,
    test_classify_blocksShortcutWithoutDelegation,
    test_classify_blocksShortcutWithoutRootFolder,
    test_classify_allowsRetryOfPendingRecord,
    test_classify_provisionsWhenReady,
    test_preview_rejectsEmptySelection,
    test_preview_rejectsOversizedSelection,
    test_preview_countsActions,
    test_preview_reportsResolutionErrorPerCourse,
    test_provision_sharedDriveGrantsBothGroups,
    test_provision_isIdempotentAcrossRuns,
    test_provision_parksCourseWithoutGroupAsPending,
    test_provision_recordsFailureWithoutAbortingBatch,
    test_provision_stopsOnTimeBudget,
    test_buildShortcutResource_shape,
    test_buildShortcutLookupQuery_escapesQuotes,
    test_decideShortcutAction_createsWhenMissing,
    test_decideShortcutAction_repairsStaleTarget,
    test_decideShortcutAction_skipsWhenCorrect,
    test_reconcile_createsOnlyMissingShortcuts,
    test_reconcile_isolatesPerStudentFailure,
    test_reconcile_ignoresSharedDriveCourses,
    test_syncForRoster_noOpForSharedDriveMode,
    test_syncForRoster_reportsUnprovisionedCourses,
    test_grant_doesNotLeadWithDomainAdminAccess,
    test_grant_retriesFreshSharedDriveNotFound,
    test_grant_fallsBackToDomainAdminAccess,
    test_grant_doesNotRetryNonNotFoundErrors,
    test_grant_plainFolderUsesSingleAttempt,
    test_provision_reusesContainerAfterGrantFailure,
    test_provision_persistsContainerBeforeGranting,
    test_reconcile_repairTrashesStaleShortcutBeforeRecreating,
    test_reconcile_rosterFailureIsNotReportedAsSynced,
    test_reconcile_recognisesManualShortcutToSameTarget,
    test_reconcile_neverTrashesAStudentOwnShortcut,
    test_reconcile_stillCreatesWhenManualShortcutPointsElsewhere,
    test_parseDriveFolderId_acceptsUrlsAndBareIds,
    test_classifyAdoptionTarget_sharedDriveRootStaysSharedDrive,
    test_classifyAdoptionTarget_myDriveFolderNeedsShortcut,
    test_classifyAdoptionTarget_folderInsideSharedDriveNeedsShortcut,
    test_classifyAdoptionTarget_rejectsFileAndTrashed,
    test_previewAdoption_countsActions,
    test_previewAdoption_allowsAdoptWithoutDelegation,
    test_previewAdoption_rejectsDriveBrowsingLink,
    test_adopt_withoutDelegationGrantsAccessAndSaysSo,
    test_adopt_skipsDriveBrowsingLink,
    test_adopt_grantsGroupsAndCreatesNothing,
    test_adopt_refusesToRepointAnActiveCourse,
    test_orderCourseIdsFromCursor_prioritisesPending,
    test_orderCourseIdsFromCursor_dropsStaleIds,
    test_batchUploadWithDrive_respectsNoneOptOut,
    test_archiveCourseDriveRecords_marksArchived,
    test_archiveCourseDriveRecords_ignoresUnknownCourse,
    test_batchHostIsPerOperation,
    test_batchEndpointOverrideIsHonoured
  ];

  let passCount = 0;
  const failures = [];

  tests.forEach(function (testFn) {
    try {
      testFn();
      passCount++;
    } catch (e) {
      failures.push(`${testFn.name}: ${e.message}`);
    }
  });

  const summary = `Course drive tests passed ${passCount}/${tests.length}.`;
  if (failures.length > 0) {
    throw new Error(`${summary}\n${failures.join("\n")}`);
  }
  return summary;
}

/* ==================== fixtures ==================== */

/**
 * An in-memory stand-in for the whole Google side. Records every mutation so a
 * test can assert not just the outcome but exactly which API calls produced it.
 */
function makeCourseDriveHarness_(config) {
  const options = config || {};
  const calls = {
    drivesCreated: [],
    foldersCreated: [],
    permissions: [],
    shortcutLookups: [],
    shortcutCreates: [],
    written: [],
    sleeps: [],
    logs: []
  };
  const registry = options.registry || {};
  const courses = options.courses || {};
  const students = options.students || {};
  const properties = options.properties || {};
  let clock = 0;

  const deps = {
    classroomCourses: {
      get: function (courseId) {
        const course = courses[String(courseId)];
        if (!course) throw new Error(`Course ${courseId} not found`);
        return course;
      }
    },
    drivesApi: {
      create: function (resource, requestId) {
        calls.drivesCreated.push({ name: resource.name, requestId: requestId });
        if (options.driveCreateError) throw new Error(options.driveCreateError);
        return { id: `drive_${calls.drivesCreated.length}`, name: resource.name };
      }
    },
    filesApi: {
      create: function (resource) {
        calls.foldersCreated.push(resource);
        return { id: `folder_${calls.foldersCreated.length}`, name: resource.name, webViewLink: "https://drive.example/f" };
      }
    },
    permissionsApi: {
      create: function (resource, fileId, optionalArgs) {
        calls.permissions.push({
          fileId: fileId, role: resource.role, type: resource.type,
          email: resource.emailAddress, args: optionalArgs
        });
        return { id: `perm_${calls.permissions.length}` };
      }
    },
    getEnrolledStudents: function (courseId) { return (students[String(courseId)] || []).slice(); },
    readRegistry: function () {
      const copy = {};
      Object.keys(registry).forEach(function (key) {
        copy[key] = JSON.parse(JSON.stringify(registry[key]));
      });
      return copy;
    },
    writeRecord: function (record) {
      calls.written.push(JSON.parse(JSON.stringify(record)));
      registry[String(record.courseId)] = JSON.parse(JSON.stringify(record));
      return 1;
    },
    now: function () { clock += (options.tickMs || 0); return clock; },
    sleep: function (ms) { calls.sleeps.push(ms); },
    uuid: function () { return "uuid-test"; },
    log: function (action, target, status, detail) {
      calls.logs.push({ action: action, target: target, status: status, detail: detail });
    },
    getProperty: function (key) { return properties[key] || null; },
    setProperty: function (key, value) { properties[key] = value; },
    deleteProperty: function (key) { delete properties[key]; },
    fetchFn: options.fetchFn || function () {
      throw new Error("fetchFn not configured for this test");
    }
  };

  return { deps: deps, calls: calls, registry: registry, properties: properties };
}

function makeCourse_(id, overrides) {
  const base = {
    id: id,
    name: `Course ${id}`,
    section: "A",
    courseState: "ACTIVE",
    courseGroupEmail: `course_${id}@classroom.example.edu`,
    teacherGroupEmail: `teacher_${id}@classroom.example.edu`
  };
  Object.keys(overrides || {}).forEach(function (key) { base[key] = overrides[key]; });
  return base;
}

function makeSettings_(overrides) {
  const base = {
    defaultMode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE,
    rootFolderId: "",
    autoProvision: false,
    delegationConfigured: true,
    shortcutModeReady: true
  };
  Object.keys(overrides || {}).forEach(function (key) { base[key] = overrides[key]; });
  return base;
}

/* ==================== naming and identity ==================== */

function test_buildCourseDriveName_joinsAndTrims() {
  assertEqual_(buildCourseDriveName_("  Math 6A  ", " 2026-Spring "), "Math 6A - 2026-Spring", "name joins with a dash");
  assertEqual_(buildCourseDriveName_("Math 6A", ""), "Math 6A", "no trailing dash without a section");
}

function test_buildCourseDriveName_fallsBackWhenEmpty() {
  assertEqual_(buildCourseDriveName_("", ""), "Course Materials", "empty inputs get a usable default");
  assertEqual_(buildCourseDriveName_(null, null), "Course Materials", "null inputs get a usable default");
}

function test_buildCourseDriveName_truncatesLongNames() {
  const long = new Array(400).join("x");
  assertEqual_(buildCourseDriveName_(long, "").length, COURSE_DRIVE_CONFIG.NAME_MAX_LENGTH, "long names are truncated");
}

function test_buildCourseDriveRequestId_isDeterministic() {
  assertEqual_(buildCourseDriveRequestId_("12345"), buildCourseDriveRequestId_("12345"),
    "same course must yield the same requestId, or a retry duplicates the drive");
  assertTrue_(buildCourseDriveRequestId_("1") !== buildCourseDriveRequestId_("2"), "different courses differ");
}

function test_buildCourseDriveRequestId_stripsUnsafeCharacters() {
  assertEqual_(buildCourseDriveRequestId_("ab/c d"), "coursedrive-abcd", "unsafe characters removed");
}

function test_normalizeCourseDriveMode_defaultsToSharedDrive() {
  assertEqual_(normalizeCourseDriveMode_(""), COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, "empty defaults to shared drive");
  assertEqual_(normalizeCourseDriveMode_("nonsense"), COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, "unknown defaults to shared drive");
}

function test_normalizeCourseDriveMode_acceptsShortcut() {
  assertEqual_(normalizeCourseDriveMode_("shortcut"), COURSE_DRIVE_CONFIG.MODE_SHORTCUT, "case insensitive");
}

function test_registryRowRoundTrip() {
  const record = {
    courseId: "77", courseName: "Math", section: "B", mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
    driveId: "", folderId: "f1", folderUrl: "https://x", courseGroupEmail: "g@x",
    teacherGroupEmail: "t@x", state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
    provisionedAt: "2026-01-01", lastReconciledAt: "", note: "n"
  };
  const back = courseDriveRowToRecord_(courseDriveRecordToRow_(record));
  assertEqual_(back.courseId, "77", "courseId survives");
  assertEqual_(back.mode, COURSE_DRIVE_CONFIG.MODE_SHORTCUT, "mode survives");
  assertEqual_(back.folderId, "f1", "folderId survives");
  assertEqual_(back.state, COURSE_DRIVE_CONFIG.STATE_ACTIVE, "state survives");
}

/* ==================== classification ==================== */

function test_classify_skipsAlreadyActive() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1"),
    { state: COURSE_DRIVE_CONFIG.STATE_ACTIVE, mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE },
    COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, makeSettings_());
  assertEqual_(verdict.action, "SKIP", "already provisioned courses are skipped");
}

function test_classify_blocksWhenCourseGroupMissing() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1", { courseGroupEmail: "" }), null,
    COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, makeSettings_());
  assertEqual_(verdict.action, "BLOCKED", "no group means no one-time grant is possible");
  assertTrue_(verdict.reason.indexOf("courseGroupEmail") !== -1, "reason names the missing field");
}

function test_classify_blocksShortcutWithoutDelegation() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1"), null, COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
    makeSettings_({ delegationConfigured: false, rootFolderId: "root1" }));
  assertEqual_(verdict.action, "BLOCKED", "shortcut mode needs delegation");
  assertTrue_(verdict.reason.indexOf("delegation") !== -1, "reason names delegation");
}

function test_classify_blocksShortcutWithoutRootFolder() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1"), null, COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
    makeSettings_({ delegationConfigured: true, rootFolderId: "" }));
  assertEqual_(verdict.action, "BLOCKED", "shortcut mode needs a root folder");
}

function test_classify_allowsRetryOfPendingRecord() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1"),
    { state: COURSE_DRIVE_CONFIG.STATE_PENDING, mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE },
    COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, makeSettings_());
  assertEqual_(verdict.action, "PROVISION", "a parked course must be retryable");
}

function test_classify_provisionsWhenReady() {
  const verdict = classifyCourseForProvisioning_(
    makeCourse_("1"), null, COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, makeSettings_());
  assertEqual_(verdict.action, "PROVISION", "ready course is provisioned");
}

/* ==================== preview ==================== */

function test_preview_rejectsEmptySelection() {
  assertThrows_(function () { previewCourseDriveProvisioning([], "SHARED_DRIVE", {}); },
    "No courses selected", "empty selection is rejected");
}

function test_preview_rejectsOversizedSelection() {
  const many = [];
  for (let i = 0; i < COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN + 1; i++) many.push(String(i));
  assertThrows_(function () { previewCourseDriveProvisioning(many, "SHARED_DRIVE", {}); },
    "Maximum", "oversized selection is rejected");
}

function test_preview_countsActions() {
  const harness = makeCourseDriveHarness_({
    courses: {
      "1": makeCourse_("1"),
      "2": makeCourse_("2", { courseGroupEmail: "" }),
      "3": makeCourse_("3")
    },
    registry: { "3": { courseId: "3", state: COURSE_DRIVE_CONFIG.STATE_ACTIVE, mode: "SHARED_DRIVE" } }
  });
  const preview = previewCourseDriveProvisioning(["1", "2", "3"], "SHARED_DRIVE", harness.deps);
  assertEqual_(preview.summary.toProvision, 1, "one course to provision");
  assertEqual_(preview.summary.blocked, 1, "one blocked on missing group");
  assertEqual_(preview.summary.skipped, 1, "one already provisioned");
  assertEqual_(preview.rows.length, 3, "one row per requested course");
}

function test_preview_reportsResolutionErrorPerCourse() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  const preview = previewCourseDriveProvisioning(["1", "missing"], "SHARED_DRIVE", harness.deps);
  assertEqual_(preview.summary.failed, 1, "unresolvable course counted as failed");
  assertEqual_(preview.summary.toProvision, 1, "the healthy course is still provisionable");
  const errorRow = preview.rows.filter(function (r) { return r.action === "ERROR"; })[0];
  assertTrue_(String(errorRow.reason).indexOf("not found") !== -1, "error reason surfaced");
}

/* ==================== provisioning ==================== */

function test_provision_sharedDriveGrantsBothGroups() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  const result = provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);

  assertEqual_(result.provisioned.length, 1, "one course provisioned");
  assertEqual_(harness.calls.drivesCreated.length, 1, "exactly one shared drive created");
  assertEqual_(harness.calls.permissions.length, 2, "teacher group and course group are both granted");

  const teacherGrant = harness.calls.permissions[0];
  const studentGrant = harness.calls.permissions[1];
  assertEqual_(teacherGrant.role, COURSE_DRIVE_CONFIG.TEACHER_ROLE, "teachers organize");
  assertEqual_(studentGrant.role, COURSE_DRIVE_CONFIG.STUDENT_ROLE, "students read");
  assertEqual_(studentGrant.email, "course_1@classroom.example.edu", "students are granted via the Classroom course group");
  assertEqual_(studentGrant.type, "group", "grant is to a group, never to individuals");
  assertFalse_(studentGrant.args.sendNotificationEmail, "no notification storm");
  assertTrue_(studentGrant.args.supportsAllDrives, "shared drive support flag set");
}

function test_provision_isIdempotentAcrossRuns() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  const second = provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);

  assertEqual_(harness.calls.drivesCreated.length, 1, "re-running must not create a second drive");
  assertEqual_(second.provisioned.length, 0, "second run provisions nothing");
  assertEqual_(second.skipped.length, 1, "second run reports the skip");
}

function test_provision_parksCourseWithoutGroupAsPending() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1", { courseGroupEmail: "" }) } });
  const result = provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);

  assertEqual_(result.provisioned.length, 0, "nothing provisioned");
  assertEqual_(harness.calls.drivesCreated.length, 0, "no drive created without a group to grant");
  assertEqual_(harness.registry["1"].state, COURSE_DRIVE_CONFIG.STATE_PENDING,
    "the course is parked, not lost");
}

function test_provision_recordsFailureWithoutAbortingBatch() {
  const harness = makeCourseDriveHarness_({
    courses: { "1": makeCourse_("1"), "2": makeCourse_("2") }
  });
  let firstCall = true;
  harness.deps.drivesApi = {
    create: function (resource, requestId) {
      if (firstCall) { firstCall = false; throw new Error("quota exceeded"); }
      harness.calls.drivesCreated.push({ name: resource.name, requestId: requestId });
      return { id: "drive_ok", name: resource.name };
    }
  };

  const result = provisionCourseDrives(["1", "2"], "SHARED_DRIVE", harness.deps);
  assertEqual_(result.errors.length, 1, "the failing course is reported");
  assertEqual_(result.provisioned.length, 1, "the healthy course still gets provisioned");
  assertEqual_(harness.registry["1"].state, COURSE_DRIVE_CONFIG.STATE_FAILED, "failure is recorded for retry");
}

function test_provision_stopsOnTimeBudget() {
  const harness = makeCourseDriveHarness_({
    courses: { "1": makeCourse_("1"), "2": makeCourse_("2") },
    tickMs: COURSE_DRIVE_CONFIG.BUDGET_MS
  });
  const result = provisionCourseDrives(["1", "2"], "SHARED_DRIVE", harness.deps);
  assertTrue_(result.skipped.length >= 1, "remaining courses are deferred rather than dropped");
  assertTrue_(String(result.skipped[result.skipped.length - 1].reason).indexOf("Time budget") !== -1,
    "the deferral reason is explicit");
}

/* ==================== shortcut mechanics ==================== */

function test_buildShortcutResource_shape() {
  const resource = buildShortcutResource_("99", "folder_1", "Math - A");
  assertEqual_(resource.mimeType, COURSE_DRIVE_CONFIG.SHORTCUT_MIME, "shortcut mime type");
  assertEqual_(resource.shortcutDetails.targetId, "folder_1", "points at the course folder");
  assertEqual_(resource.parents[0], "root", "lands in the student's My Drive root, where Drive for desktop mounts it");
  assertEqual_(resource.appProperties[COURSE_DRIVE_CONFIG.SHORTCUT_MARKER_KEY], "99",
    "carries the queryable course marker");
}

function test_buildShortcutLookupQuery_escapesQuotes() {
  const query = buildShortcutLookupQuery_("a'b");
  assertTrue_(query.indexOf("\\'") !== -1, "single quotes are escaped so the q filter cannot be broken");
  assertTrue_(query.indexOf("trashed = false") !== -1, "trashed shortcuts do not count as present");
}

function test_decideShortcutAction_createsWhenMissing() {
  assertEqual_(decideShortcutAction_(null, "folder_1").action, "CREATE", "missing shortcut is created");
}

function test_decideShortcutAction_repairsStaleTarget() {
  const decision = decideShortcutAction_({ id: "s1", shortcutDetails: { targetId: "old" } }, "folder_1");
  assertEqual_(decision.action, "REPAIR", "a shortcut pointing elsewhere is repaired");
}

function test_decideShortcutAction_skipsWhenCorrect() {
  const decision = decideShortcutAction_({ id: "s1", shortcutDetails: { targetId: "folder_1" } }, "folder_1");
  assertEqual_(decision.action, "SKIP", "a correct shortcut is left alone");
}

/* ==================== reconciler ==================== */

function makeShortcutFetchStub_(existingByStudent, failFor) {
  return function (url, params) {
    const method = String((params && params.method) || "get").toLowerCase();
    const auth = String(params.headers.Authorization || "");
    const student = auth.replace("Bearer token-for-", "");
    if (method === "get") {
      const existing = existingByStudent[student];
      const files = existing ? [existing] : [];
      return createSimpleHttpResponse_(200, JSON.stringify({ files: files }));
    }
    if (failFor && failFor.indexOf(student) !== -1) {
      return createSimpleHttpResponse_(403, '{"error":{"message":"The user does not have sufficient permissions"}}');
    }
    return createSimpleHttpResponse_(200, '{"id":"shortcut_new"}');
  };
}

function test_reconcile_createsOnlyMissingShortcuts() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_1"
      }
    },
    students: { "1": ["a@x.edu", "b@x.edu"] },
    fetchFn: makeShortcutFetchStub_({ "a@x.edu": { id: "s1", shortcutDetails: { targetId: "folder_1" } } })
  });

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.skipped, 1, "the student who already has it is skipped");
  assertEqual_(report.created, 1, "only the missing student gets a shortcut");
  assertEqual_(report.failed, 0, "no failures");
}

function test_reconcile_isolatesPerStudentFailure() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_1"
      }
    },
    students: { "1": ["ok@x.edu", "bad@x.edu"] },
    fetchFn: makeShortcutFetchStub_({}, ["bad@x.edu"])
  });

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.created, 1, "one student still succeeds");
  assertEqual_(report.failed, 1, "the other is reported, not thrown");
  assertTrue_(report.courses[0].failures.length === 1, "the failure names the student");
}

function test_reconcile_ignoresSharedDriveCourses() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE,
        state: COURSE_DRIVE_CONFIG.STATE_ACTIVE, folderId: "drive_1"
      }
    },
    students: { "1": ["a@x.edu"] }
  });
  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.created, 0, "shared drive courses need no shortcut work at all");
}

/* ==================== roster integration ==================== */

function test_syncForRoster_noOpForSharedDriveMode() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": { courseId: "1", mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE }
    }
  });
  const result = syncCourseDriveForRoster_(["1"], harness.deps);
  assertEqual_(result.mode, COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, "reports shared drive mode");
  assertTrue_(result.message.indexOf("No action needed") !== -1,
    "enrolment alone grants access — the UI must say so rather than imply work happened");
}

function test_syncForRoster_reportsUnprovisionedCourses() {
  const harness = makeCourseDriveHarness_({ registry: {} });
  const result = syncCourseDriveForRoster_(["1"], harness.deps);
  assertTrue_(result.message.indexOf("not provisioned") !== -1 ||
    result.message.indexOf("No course materials folder") !== -1, "unprovisioned courses are called out");
}

/* ==================== teardown ==================== */

function test_archiveCourseDriveRecords_marksArchived() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": { courseId: "1", state: COURSE_DRIVE_CONFIG.STATE_ACTIVE, mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE }
    }
  });
  const result = archiveCourseDriveRecords(["1"], harness.deps);
  assertEqual_(result.archived.length, 1, "the record is archived");
  assertEqual_(harness.registry["1"].state, COURSE_DRIVE_CONFIG.STATE_ARCHIVED, "state updated");
  assertEqual_(harness.calls.drivesCreated.length, 0, "archiving never touches Drive content");
}

function test_archiveCourseDriveRecords_ignoresUnknownCourse() {
  const harness = makeCourseDriveHarness_({ registry: {} });
  const result = archiveCourseDriveRecords(["nope"], harness.deps);
  assertEqual_(result.archived.length, 0, "unknown courses are a no-op");
  assertEqual_(result.errors.length, 0, "and not an error");
}

/* ==================== regression tests for review findings ==================== */

/**
 * A grant that keeps failing must not leak a new folder on every hourly retry.
 * This is the defect that would have quietly filled a domain with empty drives.
 */
function test_provision_reusesContainerAfterGrantFailure() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  let grantAttempts = 0;
  harness.deps.permissionsApi = {
    create: function () {
      grantAttempts++;
      throw new Error("group not resolvable yet");
    }
  };

  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertEqual_(harness.calls.drivesCreated.length, 1, "first run creates the drive");
  assertEqual_(harness.registry["1"].state, COURSE_DRIVE_CONFIG.STATE_FAILED, "grant failure recorded");
  assertEqual_(harness.registry["1"].driveId, "drive_1", "the failure row keeps the container id");

  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertEqual_(harness.calls.drivesCreated.length, 1,
    "the retry must reuse the existing drive, not create a second one");
  assertTrue_(grantAttempts >= 2, "the retry does re-attempt the grant");
}

function test_provision_persistsContainerBeforeGranting() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  const writesBeforeFirstGrant = [];
  const realCreate = harness.deps.permissionsApi.create;
  harness.deps.permissionsApi = {
    create: function (resource, fileId, args) {
      if (writesBeforeFirstGrant.length === 0) {
        harness.calls.written.forEach(function (w) { writesBeforeFirstGrant.push(w); });
      }
      return realCreate(resource, fileId, args);
    }
  };

  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertEqual_(writesBeforeFirstGrant.length, 1, "the container is recorded before any grant is attempted");
  assertEqual_(writesBeforeFirstGrant[0].driveId, "drive_1", "and the record carries the id");
}

/**
 * REPAIR used to create a second shortcut and leave the stale one in place,
 * which meant one extra shortcut per student per reconciler run.
 */
function test_reconcile_repairTrashesStaleShortcutBeforeRecreating() {
  const trashed = [];
  const created = [];
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_new"
      }
    },
    students: { "1": ["a@x.edu"] },
    fetchFn: function (url, params) {
      const method = String((params && params.method) || "get").toLowerCase();
      if (method === "get") {
        return createSimpleHttpResponse_(200, JSON.stringify({
          files: [{ id: "stale_1", shortcutDetails: { targetId: "folder_old" } }]
        }));
      }
      if (method === "patch") {
        trashed.push(url);
        return createSimpleHttpResponse_(200, '{"id":"stale_1","trashed":true}');
      }
      created.push(url);
      return createSimpleHttpResponse_(200, '{"id":"shortcut_new"}');
    }
  });

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.repaired, 1, "counted as a repair");
  assertEqual_(trashed.length, 1, "the stale shortcut is trashed");
  assertTrue_(trashed[0].indexOf("stale_1") !== -1, "the trashed file is the stale shortcut");
  assertEqual_(created.length, 1, "exactly one replacement shortcut is created");
}

function test_reconcile_rosterFailureIsNotReportedAsSynced() {
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_1"
      }
    }
  });
  harness.deps.getEnrolledStudents = function () { throw new Error("Classroom unavailable"); };

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.failed, 1, "an unreadable roster is a failure, not a clean sync");
  assertTrue_(!harness.registry["1"].lastReconciledAt,
    "a course whose roster could not be read must not be stamped as reconciled");
}

function test_orderCourseIdsFromCursor_prioritisesPending() {
  const ordered = orderCourseIdsFromCursor_(["a", "b", "c", "d"], ["c", "d"]);
  assertEqual_(ordered[0], "c", "the saved tail runs first");
  assertEqual_(ordered[1], "d", "in its saved order");
  assertEqual_(ordered.length, 4, "and nothing is dropped");
}

function test_orderCourseIdsFromCursor_dropsStaleIds() {
  const ordered = orderCourseIdsFromCursor_(["a", "b"], ["gone", "b"]);
  assertEqual_(ordered.length, 2, "courses no longer eligible are dropped from the cursor");
  assertEqual_(ordered[0], "b", "the still-eligible pending course keeps priority");
}

/**
 * normalizeCourseDriveMode_ coerces anything unrecognised to SHARED_DRIVE, which
 * is right for a mode choice and would be catastrophic for an opt-out.
 */
function test_batchUploadWithDrive_respectsNoneOptOut() {
  assertEqual_(normalizeCourseDriveMode_("NONE"), COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE,
    "documents why NONE must be handled before normalisation");
}

/* ============ shared-drive grant: the live 404 this feature shipped with ============ */

function makeNotFoundError_(driveId) {
  const err = new Error(`drive.permissions.create API 呼叫失敗 (錯誤訊息：File not found: ${driveId}.)`);
  err.details = { code: 404, errors: [{ reason: "notFound" }] };
  return err;
}

/**
 * The regression. Leading with useDomainAdminAccess resolves a seconds-old drive
 * through the domain-admin index and 404s, so every fresh SHARED_DRIVE provision
 * failed. We are the drive's organizer already — member access must come first.
 */
function test_grant_doesNotLeadWithDomainAdminAccess() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  harness.calls.permissions.forEach(function (call) {
    assertTrue_(!call.args.useDomainAdminAccess,
      "the first attempt must use ordinary member access, not domain admin access");
    assertTrue_(call.args.supportsAllDrives, "shared drive support is still required");
  });
}

function test_grant_retriesFreshSharedDriveNotFound() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  let attempts = 0;
  harness.deps.permissionsApi = {
    create: function (resource, fileId, args) {
      attempts++;
      if (attempts === 1) throw makeNotFoundError_(fileId);
      harness.calls.permissions.push({ fileId: fileId, role: resource.role, args: args });
      return { id: "perm" };
    }
  };

  const result = provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertEqual_(result.errors.length, 0, "a propagation 404 is retried, not surfaced as a failure");
  assertEqual_(result.provisioned.length, 1, "the course provisions successfully");
  assertTrue_(harness.calls.sleeps.length >= 1, "the retry waits for the drive to become consistent");
}

function test_grant_fallsBackToDomainAdminAccess() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  const argsSeen = [];
  harness.deps.permissionsApi = {
    create: function (resource, fileId, args) {
      argsSeen.push(args);
      if (argsSeen.length < 3) throw makeNotFoundError_(fileId);
      return { id: "perm" };
    }
  };

  provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertTrue_(!argsSeen[0].useDomainAdminAccess, "attempt 1 is member access");
  assertTrue_(!argsSeen[1].useDomainAdminAccess, "attempt 2 is member access after a wait");
  assertTrue_(argsSeen[2].useDomainAdminAccess,
    "the last resort is domain admin access, which adoption of a non-member drive needs");
}

function test_grant_doesNotRetryNonNotFoundErrors() {
  const harness = makeCourseDriveHarness_({ courses: { "1": makeCourse_("1") } });
  let attempts = 0;
  harness.deps.permissionsApi = {
    create: function () {
      attempts++;
      throw new Error("Invalid value for role");
    }
  };

  const result = provisionCourseDrives(["1"], "SHARED_DRIVE", harness.deps);
  assertEqual_(attempts, 1, "a permanent error is not retried — retrying just burns the time budget");
  assertEqual_(result.errors.length, 1, "and it is reported");
}

function test_grant_plainFolderUsesSingleAttempt() {
  const attempts = buildGrantAttempts_(false);
  assertEqual_(attempts.length, 1, "a My Drive folder has no propagation problem to work around");
  assertTrue_(!attempts[0].useDomainAdminAccess, "and never needs domain admin access");
}

/* ============ adoption of a folder a teacher already set up by hand ============ */

/**
 * The exact scenario this feature exists for: students already made their own
 * shortcuts to the teacher's folder. A hand-made shortcut carries none of our
 * appProperties, so the marker lookup misses it — without the target fallback
 * the reconciler would hand every student a second shortcut.
 */
function test_reconcile_recognisesManualShortcutToSameTarget() {
  const writes = [];
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_teacher"
      }
    },
    students: { "1": ["a@x.edu"] },
    fetchFn: function (url, params) {
      const method = String((params && params.method) || "get").toLowerCase();
      if (method !== "get") { writes.push(url); return createSimpleHttpResponse_(200, '{"id":"x"}'); }
      // The marker query finds nothing; the root scan finds the student's own one.
      if (url.indexOf("appProperties") !== -1) {
        return createSimpleHttpResponse_(200, '{"files":[]}');
      }
      return createSimpleHttpResponse_(200, JSON.stringify({
        files: [{ id: "manual_1", name: "Teacher stuff", shortcutDetails: { targetId: "folder_teacher" } }]
      }));
    }
  });

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.skipped, 1, "the student's own shortcut counts as already present");
  assertEqual_(report.created, 0, "no duplicate shortcut is created");
  assertEqual_(writes.length, 0, "nothing at all is written into the student's Drive");
}

function test_reconcile_neverTrashesAStudentOwnShortcut() {
  const trashed = [];
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_new"
      }
    },
    students: { "1": ["a@x.edu"] },
    fetchFn: function (url, params) {
      const method = String((params && params.method) || "get").toLowerCase();
      if (method === "patch") { trashed.push(url); return createSimpleHttpResponse_(200, "{}"); }
      if (method === "get") {
        // A marker lookup that (contrary to the real implementation) hands back
        // an unmarked shortcut with a stale target — the guard must still hold.
        return createSimpleHttpResponse_(200, JSON.stringify({
          files: [{ id: "manual_1", unmarked: true, shortcutDetails: { targetId: "folder_old" } }]
        }));
      }
      return createSimpleHttpResponse_(200, '{"id":"new"}');
    }
  });

  reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(trashed.length, 0, "a shortcut the student made must never be trashed by this tool");
}

function test_reconcile_stillCreatesWhenManualShortcutPointsElsewhere() {
  const created = [];
  const harness = makeCourseDriveHarness_({
    registry: {
      "1": {
        courseId: "1", courseName: "Math", section: "A",
        mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        folderId: "folder_new"
      }
    },
    students: { "1": ["a@x.edu"] },
    fetchFn: function (url, params) {
      const method = String((params && params.method) || "get").toLowerCase();
      if (method === "get") {
        if (url.indexOf("appProperties") !== -1) return createSimpleHttpResponse_(200, '{"files":[]}');
        // Their manual shortcut points at the teacher's OLD folder.
        return createSimpleHttpResponse_(200, JSON.stringify({
          files: [{ id: "manual_1", shortcutDetails: { targetId: "folder_old" } }]
        }));
      }
      created.push(url);
      return createSimpleHttpResponse_(200, '{"id":"new"}');
    }
  });

  const report = reconcileCourseShortcuts({ courseIds: ["1"] }, withStubbedToken_(harness.deps));
  assertEqual_(report.created, 1, "a shortcut to a different folder does not satisfy this course");
  assertEqual_(created.length, 1, "and exactly one is created");
}

function test_parseDriveFolderId_acceptsUrlsAndBareIds() {
  const id = "1AbCdEfGhIjKlMnOpQr";
  assertEqual_(parseDriveFolderId_(id), id, "bare id");
  assertEqual_(parseDriveFolderId_(`https://drive.google.com/drive/folders/${id}`), id, "folder URL");
  assertEqual_(parseDriveFolderId_(`https://drive.google.com/drive/u/2/folders/${id}?usp=sharing`), id, "u/N URL with query");
  assertEqual_(parseDriveFolderId_("not a link"), "", "unparseable input yields empty, never a guess");
}

function test_classifyAdoptionTarget_sharedDriveRootStaysSharedDrive() {
  const verdict = classifyAdoptionTarget_({
    id: "drive_9", driveId: "drive_9", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME, name: "Math"
  });
  assertTrue_(verdict.ok, "a shared drive root is adoptable");
  assertEqual_(verdict.mode, COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, "no shortcut needed for a shared drive root");
  assertEqual_(verdict.driveId, "drive_9", "the drive id is captured");
}

function test_classifyAdoptionTarget_myDriveFolderNeedsShortcut() {
  const verdict = classifyAdoptionTarget_({
    id: "folder_1", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME, name: "Materials"
  });
  assertEqual_(verdict.mode, COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
    "a My Drive folder lands in Shared with me, which Drive for desktop never mounts");
}

function test_classifyAdoptionTarget_folderInsideSharedDriveNeedsShortcut() {
  // Access without drive membership does not put the drive in their nav either.
  const verdict = classifyAdoptionTarget_({
    id: "folder_5", driveId: "drive_9", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME, name: "Unit 1"
  });
  assertEqual_(verdict.mode, COURSE_DRIVE_CONFIG.MODE_SHORTCUT, "a subfolder of a shared drive still needs a shortcut");
  assertEqual_(verdict.driveId, "", "it is not itself a drive root");
}

function test_classifyAdoptionTarget_rejectsFileAndTrashed() {
  assertFalse_(classifyAdoptionTarget_({ id: "f", mimeType: "application/pdf" }).ok, "a file is not a folder");
  assertFalse_(classifyAdoptionTarget_({ id: "f", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME, trashed: true }).ok,
    "a trashed folder is refused");
  assertFalse_(classifyAdoptionTarget_(null).ok, "missing metadata is refused");
}

function makeAdoptionHarness_(folderMeta, registry) {
  const harness = makeCourseDriveHarness_({
    courses: { "1": makeCourse_("1") },
    registry: registry || {}
  });
  harness.deps.filesApi = {
    get: function (fileId) {
      harness.calls.foldersCreated.push({ read: fileId });
      return folderMeta;
    },
    create: function () { throw new Error("adoption must not create anything"); }
  };
  harness.deps.isDelegationConfigured = function () { return true; };
  return harness;
}

function test_previewAdoption_countsActions() {
  const harness = makeAdoptionHarness_({
    id: "folder_teacher", name: "Teacher materials", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME,
    webViewLink: "https://drive.example/t"
  });
  const preview = previewCourseDriveAdoption(
    [{ courseId: "1", folderId: "https://drive.google.com/drive/folders/folder_teacher" }], harness.deps);
  assertEqual_(preview.summary.toAdopt, 1, "one course to adopt");
  assertEqual_(preview.rows[0].mode, COURSE_DRIVE_CONFIG.MODE_SHORTCUT, "mode derived from where the folder lives");
  assertEqual_(preview.rows[0].folderName, "Teacher materials", "the folder is named back to the admin for confirmation");
}

function test_adopt_grantsGroupsAndCreatesNothing() {
  const harness = makeAdoptionHarness_({
    id: "folder_teacher", name: "Teacher materials", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME,
    webViewLink: "https://drive.example/t"
  });
  // No students, so no shortcut fan-out is attempted in this test.
  harness.deps.getEnrolledStudents = function () { return []; };
  harness.deps.isDelegationConfigured = function () { return true; };

  const result = adoptCourseDriveFolders([{ courseId: "1", folderId: "folder_teacher" }], withStubbedToken_(harness.deps));

  assertEqual_(result.provisioned.length, 1, "the course is adopted");
  assertEqual_(harness.calls.drivesCreated.length, 0, "no shared drive is created");
  assertEqual_(harness.registry["1"].folderId, "folder_teacher", "the teacher's own folder becomes the container");
  assertEqual_(harness.calls.permissions.length, 2, "teacher group and course group are both granted");
  assertEqual_(harness.calls.permissions[1].email, "course_1@classroom.example.edu",
    "students are granted via the Classroom course group, exactly as in provisioning");
  assertTrue_(String(harness.registry["1"].note).indexOf("Adopted") !== -1, "the registry records that it was adopted");
}

/**
 * The live failure: adopting a teacher's My Drive folder was refused outright
 * when no delegation service account existed, leaving Adopt permanently
 * disabled with no error. The group grant works without delegation, so the
 * adoption must proceed and merely warn about the shortcut half.
 */
function test_previewAdoption_allowsAdoptWithoutDelegation() {
  const harness = makeAdoptionHarness_({
    id: "folder_teacher", name: "Teacher materials", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME
  });
  harness.deps.isDelegationConfigured = function () { return false; };

  const preview = previewCourseDriveAdoption([{ courseId: "1", folderId: "folder_teacher" }], harness.deps);
  assertEqual_(preview.summary.toAdopt, 1, "adoption is offered even with no delegation configured");
  assertEqual_(preview.summary.blocked, 0, "it is not blocked");
  assertTrue_(String(preview.rows[0].warning).indexOf("shortcuts cannot be placed") !== -1,
    "but the admin is told the shortcut half will not happen");
}

function test_previewAdoption_rejectsDriveBrowsingLink() {
  const harness = makeAdoptionHarness_({ id: "x", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME });
  const navToken = "138S9ZjcxVAEcpmaWFcTs51-8mTIbfvdPuGeeWB8bHAZsRSRZQ8vz9nCG_3rM6yfSK4kbm5x2";
  const preview = previewCourseDriveAdoption(
    [{ courseId: "1", folderId: `https://drive.google.com/drive/u/1/folders/${navToken}` }], harness.deps);
  assertEqual_(preview.summary.blocked, 1, "a Drive browsing link is refused up front");
  assertTrue_(String(preview.rows[0].reason).indexOf("Share > Copy link") !== -1,
    "and the admin is told exactly what to paste instead");
  assertEqual_(harness.calls.foldersCreated.length, 0, "no pointless Drive lookup is made");
}

function test_adopt_withoutDelegationGrantsAccessAndSaysSo() {
  const harness = makeAdoptionHarness_({
    id: "folder_teacher", name: "Teacher materials", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME
  });
  harness.deps.isDelegationConfigured = function () { return false; };

  const result = adoptCourseDriveFolders([{ courseId: "1", folderId: "folder_teacher" }], harness.deps);
  assertEqual_(result.provisioned.length, 1, "the folder is adopted");
  assertEqual_(harness.calls.permissions.length, 2, "both group grants are applied");
  assertTrue_(String(result.shortcutSync.message).indexOf("Shared with me") !== -1,
    "the report explains where students will find it instead");
  assertEqual_(result.shortcutSync.created, 0, "no shortcuts were placed");
}

function test_adopt_skipsDriveBrowsingLink() {
  const harness = makeAdoptionHarness_({ id: "x", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME });
  const navToken = "138S9ZjcxVAEcpmaWFcTs51-8mTIbfvdPuGeeWB8bHAZsRSRZQ8vz9nCG_3rM6yfSK4kbm5x2";
  const result = adoptCourseDriveFolders([{ courseId: "1", folderId: navToken }], harness.deps);
  assertEqual_(result.provisioned.length, 0, "nothing is adopted from a browsing link");
  assertEqual_(result.skipped.length, 1, "it is reported as skipped, with a reason");
}

function test_adopt_refusesToRepointAnActiveCourse() {
  const harness = makeAdoptionHarness_(
    { id: "folder_other", name: "Other", mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME },
    { "1": { courseId: "1", state: COURSE_DRIVE_CONFIG.STATE_ACTIVE, mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE, folderId: "drive_1" } }
  );
  const result = adoptCourseDriveFolders([{ courseId: "1", folderId: "folder_other" }], harness.deps);
  assertEqual_(result.provisioned.length, 0, "an active course is not silently re-pointed");
  assertEqual_(result.skipped.length, 1, "it is reported as skipped");
  assertEqual_(harness.registry["1"].folderId, "drive_1", "the existing container is left alone");
}

/* ==================== batch helper generalisation ==================== */

function test_batchHostIsPerOperation() {
  const body = buildBatchMultipartRequest_([
    { contentId: "a", method: "POST", path: "/drive/v3/files", body: {}, host: COURSE_DRIVE_CONFIG.DRIVE_API_HOST }
  ], "bnd");
  assertTrue_(body.indexOf(`Host: ${COURSE_DRIVE_CONFIG.DRIVE_API_HOST}`) !== -1,
    "an operation can target the Drive host");
  assertTrue_(body.indexOf("Host: classroom.googleapis.com") === -1, "the Classroom host is not forced");

  const legacy = buildBatchMultipartRequest_([
    { contentId: "b", method: "POST", path: "/v1/courses", body: {} }
  ], "bnd");
  assertTrue_(legacy.indexOf("Host: classroom.googleapis.com") !== -1,
    "existing Classroom call sites keep their default host");
}

function test_batchEndpointOverrideIsHonoured() {
  const seen = [];
  const fetchFn = function (url) {
    seen.push(url);
    return {
      getResponseCode: function () { return 200; },
      getAllHeaders: function () { return { "Content-Type": "multipart/mixed; boundary=x" }; },
      getContentText: function () { return "--x--"; }
    };
  };
  executeBatchOperations_([{ contentId: "a", method: "GET", path: "/drive/v3/files", body: {} }],
    fetchFn, { endpoint: COURSE_DRIVE_CONFIG.DRIVE_BATCH_ENDPOINT });
  assertEqual_(seen[0], COURSE_DRIVE_CONFIG.DRIVE_BATCH_ENDPOINT, "the Drive batch endpoint is used when requested");

  seen.length = 0;
  executeBatchOperations_([{ contentId: "a", method: "GET", path: "/v1/courses", body: {} }], fetchFn);
  assertEqual_(seen[0], COURSE_BATCH_CONFIG.ENDPOINT, "the default endpoint is unchanged");
}

/**
 * Shortcut helpers mint an impersonated token through fetchImpersonatedAccessToken_,
 * which would otherwise read real Script Properties. Injecting credentials and a
 * fake signer keeps the suite offline, matching the existing delegation tests.
 */
function withStubbedToken_(deps) {
  deps.creds = { email: "sa@test.iam.gserviceaccount.com", key: "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----" };
  deps.signFn = function () { return [1, 2, 3]; };
  // The reconciler refuses to run without delegation; the suite must not read
  // the project's real Script Properties to decide that.
  deps.isDelegationConfigured = function () { return true; };
  const innerFetch = deps.fetchFn;
  deps.fetchFn = function (url, params) {
    if (String(url).indexOf("oauth2.googleapis.com/token") !== -1) {
      const assertionSubject = decodeStubSubject_(params);
      return createSimpleHttpResponse_(200, JSON.stringify({ access_token: `token-for-${assertionSubject}` }));
    }
    return innerFetch(url, params);
  };
  return deps;
}

function decodeStubSubject_(params) {
  const assertion = String((params && params.payload && params.payload.assertion) || "");
  const claimSegment = assertion.split(".")[1] || "";
  try {
    const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(claimSegment)).getDataAsString();
    return (safeJsonParse_(json) || {}).sub || "unknown";
  } catch (e) {
    return "unknown";
  }
}

/**
 * Convenience entry point: runs every suite. `runBatchCourseUnitTests()`,
 * `runCourseDriveUnitTests()` and `runEmailAttachUnitTests()` still work on
 * their own.
 */
function runAllUnitTests() {
  const batch = runBatchCourseUnitTests();
  const courseDrive = runCourseDriveUnitTests();
  const emailAttach = runEmailAttachUnitTests();
  return `${batch} ${courseDrive} ${emailAttach}`;
}
