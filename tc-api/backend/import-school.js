// import-school.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 1. 開啟 SQLite
const dbPath = path.join(__dirname, 'school.db');
const db = new Database(dbPath);

// 2. 建立資料表（如果不存在）
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semesters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      year          INTEGER NOT NULL,
      term          INTEGER NOT NULL,
      start_date    TEXT,
      end_date      TEXT,
      open_date     TEXT,
      close_date    TEXT,
      updated_at    TEXT,
      UNIQUE (year, term)
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uid         INTEGER,
      uid2        TEXT,
      name        TEXT NOT NULL,
      id_hash     TEXT,
      UNIQUE (uid, uid2)
    );

    CREATE TABLE IF NOT EXISTS students (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_no   TEXT NOT NULL,
      name         TEXT NOT NULL,
      eng_name     TEXT,
      gender       TEXT,
      id_hash      TEXT,
      uid          INTEGER,
      uid2         TEXT,
      UNIQUE (student_no)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id  INTEGER NOT NULL,
      grade        INTEGER NOT NULL,
      class_name   TEXT NOT NULL,
      class_seq    INTEGER NOT NULL,
      UNIQUE (semester_id, grade, class_seq),
      FOREIGN KEY (semester_id) REFERENCES semesters(id)
    );

    CREATE TABLE IF NOT EXISTS class_teachers (
      class_id   INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      PRIMARY KEY (class_id, teacher_id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id  INTEGER NOT NULL,
      class_id     INTEGER NOT NULL,
      student_id   INTEGER NOT NULL,
      seat_no      INTEGER,
      UNIQUE (semester_id, class_id, student_id),
      UNIQUE (semester_id, class_id, seat_no),
      FOREIGN KEY (semester_id) REFERENCES semesters(id),
      FOREIGN KEY (class_id)    REFERENCES classes(id),
      FOREIGN KEY (student_id)  REFERENCES students(id)
    );
  `);
}

// 3. Upsert helper
function upsertSemester(studentsMeta) {
  const stmt = db.prepare(`
    INSERT INTO semesters (year, term, start_date, end_date, open_date, close_date, updated_at)
    VALUES (@year, @term, @start_date, @end_date, @open_date, @close_date, @updated_at)
    ON CONFLICT(year, term) DO UPDATE SET
      start_date = excluded.start_date,
      end_date   = excluded.end_date,
      open_date  = excluded.open_date,
      close_date = excluded.close_date,
      updated_at = excluded.updated_at
    ;
  `);

  stmt.run({
    year: studentsMeta['學年'],
    term: studentsMeta['學期'],
    start_date: studentsMeta['學期開始日期'],
    end_date: studentsMeta['學期結束日期'],
    open_date: studentsMeta['開學日'],
    close_date: studentsMeta['結業日'],
    updated_at: studentsMeta['更新時間']
  });

  const row = db.prepare(
    `SELECT id FROM semesters WHERE year = ? AND term = ?`
  ).get(studentsMeta['學年'], studentsMeta['學期']);

  return row.id;
}

function upsertTeacher(t) {
  const stmt = db.prepare(`
    INSERT INTO teachers (uid, uid2, name, id_hash)
    VALUES (@uid, @uid2, @name, @id_hash)
    ON CONFLICT(uid, uid2) DO UPDATE SET
      name   = excluded.name,
      id_hash = excluded.id_hash
    ;
  `);

  stmt.run({
    uid: t['UID'],
    uid2: t['UID2'],
    name: t['姓名'],
    id_hash: t['身分證編碼'] || null
  });

  const row = db.prepare(
    `SELECT id FROM teachers WHERE uid = ? AND uid2 = ?`
  ).get(t['UID'], t['UID2']);

  return row.id;
}

function upsertStudent(s) {
  const stmt = db.prepare(`
    INSERT INTO students (student_no, name, eng_name, gender, id_hash, uid, uid2)
    VALUES (@student_no, @name, @eng_name, @gender, @id_hash, @uid, @uid2)
    ON CONFLICT(student_no) DO UPDATE SET
      name     = excluded.name,
      eng_name = excluded.eng_name,
      gender   = excluded.gender,
      id_hash  = excluded.id_hash,
      uid      = excluded.uid,
      uid2     = excluded.uid2
    ;
  `);

  stmt.run({
    student_no: s['學號'],
    name: s['姓名'],
    eng_name: s['英文姓名'],
    gender: s['性別'],
    id_hash: s['身分證編碼'] || null,
    uid: s['UID'],
    uid2: s['UID2']
  });

  const row = db.prepare(
    `SELECT id FROM students WHERE student_no = ?`
  ).get(s['學號']);

  return row.id;
}

function upsertClass(semesterId, c) {
  const stmt = db.prepare(`
    INSERT INTO classes (semester_id, grade, class_name, class_seq)
    VALUES (@semester_id, @grade, @class_name, @class_seq)
    ON CONFLICT(semester_id, grade, class_seq) DO NOTHING;
  `);

  stmt.run({
    semester_id: semesterId,
    grade: c['年級'],
    class_name: c['班名'],
    class_seq: c['班序']
  });

  const row = db.prepare(
    `SELECT id FROM classes WHERE semester_id = ? AND grade = ? AND class_seq = ?`
  ).get(semesterId, c['年級'], c['班序']);

  return row.id;
}

function ensureClassTeacher(classId, teacherId) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO class_teachers (class_id, teacher_id)
    VALUES (?, ?)
  `);
  stmt.run(classId, teacherId);
}

function upsertEnrollment(semesterId, classId, studentId, seatNo) {
  const stmt = db.prepare(`
    INSERT INTO enrollments (semester_id, class_id, student_id, seat_no)
    VALUES (@semester_id, @class_id, @student_id, @seat_no)
    ON CONFLICT(semester_id, class_id, student_id) DO UPDATE SET
      seat_no = excluded.seat_no
  `);

  stmt.run({
    semester_id: semesterId,
    class_id: classId,
    student_id: studentId,
    seat_no: seatNo
  });
}

// 4. 主程式：讀取 JSON → 寫入 SQLite
function importSchool(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  const studentsMeta = data.students;
  const classes = studentsMeta['學期編班'];

  db.transaction(() => {
    // (1) 學期
    const semesterId = upsertSemester(studentsMeta);

    // (2) 迭代每一個班級
    for (const klass of classes) {
      const classId = upsertClass(semesterId, klass);

      // (2-1) 導師（可能不只一位）
      const teachers = klass['導師'] || [];
      for (const t of teachers) {
        const teacherId = upsertTeacher(t);
        ensureClassTeacher(classId, teacherId);
      }

      // (2-2) 學生編班
      const enrollList = klass['學期編班'] || [];
      for (const stu of enrollList) {
        const studentId = upsertStudent(stu);
        const seatNo = stu['座號'];
        upsertEnrollment(semesterId, classId, studentId, seatNo);
      }
    }
  })();
}

// 執行
(function main() {
  initSchema();
  const jsonPath = path.join(__dirname, 'school.json');
  importSchool(jsonPath);
  console.log('Import finished.');
})();
