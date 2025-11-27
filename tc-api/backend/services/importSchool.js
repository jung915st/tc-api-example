// services/importSchool.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "../school.db"));

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      term INTEGER NOT NULL,
      start_date TEXT,
      end_date TEXT,
      open_date TEXT,
      close_date TEXT,
      updated_at TEXT,
      UNIQUE (year, term)
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid INTEGER,
      uid2 TEXT,
      name TEXT NOT NULL,
      id_hash TEXT,
      UNIQUE (uid, uid2)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_no TEXT NOT NULL,
      name TEXT NOT NULL,
      eng_name TEXT,
      gender TEXT,
      id_hash TEXT,
      uid INTEGER,
      uid2 TEXT,
      UNIQUE(student_no)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id INTEGER NOT NULL,
      grade INTEGER NOT NULL,
      class_name TEXT NOT NULL,
      class_seq INTEGER NOT NULL,
      UNIQUE(semester_id, grade, class_seq)
    );

    CREATE TABLE IF NOT EXISTS class_teachers (
      class_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      PRIMARY KEY(class_id, teacher_id)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      seat_no INTEGER,
      UNIQUE (semester_id, class_id, student_id)
    );
  `);
}

async function importSchool(schoolData, options = {}) {
  initSchema();

  let data = null;

  if (options.fromApi) {
    data = schoolData;
  } else {
    const raw = fs.readFileSync(schoolData, "utf8");
    data = JSON.parse(raw);
  }

  const meta = data.students;

  const semesterId = upsertSemester(meta);

  for (const klass of meta["學期編班"]) {
    const classId = upsertClass(semesterId, klass);

    for (const t of klass["導師"] || []) {
      const teacherId = upsertTeacher(t);
      db.prepare(`
        INSERT OR IGNORE INTO class_teachers (class_id, teacher_id)
        VALUES (?, ?)
      `).run(classId, teacherId);
    }

    for (const stu of klass["學期編班"] || []) {
      const studentId = upsertStudent(stu);

      db.prepare(`
        INSERT INTO enrollments (semester_id, class_id, student_id, seat_no)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(semester_id, class_id, student_id)
        DO UPDATE SET seat_no = excluded.seat_no
      `).run(semesterId, classId, studentId, stu["座號"]);
    }
  }

  return true;
}

function upsertSemester(meta) {
  db.prepare(`
    INSERT INTO semesters (year, term, start_date, end_date, open_date, close_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, term)
    DO UPDATE SET start_date=excluded.start_date, end_date=excluded.end_date,
      open_date=excluded.open_date, close_date=excluded.close_date, updated_at=excluded.updated_at
  `).run(
    meta["學年"],
    meta["學期"],
    meta["學期開始日期"],
    meta["學期結束日期"],
    meta["開學日"],
    meta["結業日"],
    meta["更新時間"]
  );

  return db.prepare(`SELECT id FROM semesters WHERE year=? AND term=?`)
    .get(meta["學年"], meta["學期"]).id;
}

function upsertTeacher(t) {
  db.prepare(`
    INSERT INTO teachers (uid, uid2, name, id_hash)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(uid, uid2)
    DO UPDATE SET name=excluded.name, id_hash=excluded.id_hash
  `).run(t["UID"], t["UID2"], t["姓名"], t["身分證編碼"]);

  return db.prepare(`SELECT id FROM teachers WHERE uid=? AND uid2=?`)
    .get(t["UID"], t["UID2"]).id;
}

function upsertStudent(s) {
  db.prepare(`
    INSERT INTO students (student_no, name, eng_name, gender, id_hash, uid, uid2)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_no)
    DO UPDATE SET name=excluded.name, eng_name=excluded.eng_name, gender=excluded.gender
  `).run(
    s["學號"],
    s["姓名"],
    s["英文姓名"],
    s["性別"],
    s["身分證編碼"],
    s["UID"],
    s["UID2"]
  );

  return db.prepare(`SELECT id FROM students WHERE student_no=?`)
    .get(s["學號"]).id;
}

function upsertClass(semesterId, c) {
  db.prepare(`
    INSERT INTO classes (semester_id, grade, class_name, class_seq)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(semester_id, grade, class_seq)
    DO NOTHING
  `).run(semesterId, c["年級"], c["班名"], c["班序"]);

  return db.prepare(`
    SELECT id FROM classes WHERE semester_id=? AND grade=? AND class_seq=?
  `).get(semesterId, c["年級"], c["班序"]).id;
}

module.exports = importSchool;
