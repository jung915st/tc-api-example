// routes/students.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

router.get("/", (req, res) => {
  const filePath = path.join(__dirname, "../data/school.json");

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "請先同步資料" });
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const { grade, class_seq } = req.query;

  const classes = data["學期編班"];

  // 篩選年級
  let filtered = classes;
  if (grade) {
    filtered = filtered.filter(c => c["年級"] == grade);
  }

  // 篩選班序
  if (class_seq) {
    filtered = filtered.filter(c => c["班序"] == class_seq);
  }

  const result = [];

  for (const klass of filtered) {
    for (const stu of klass["學期編班"] || []) {
      result.push({
        student_no: stu["學號"],
        name: stu["姓名"],
        gender: stu["性別"],
        grade: klass["年級"],
        class_name: klass["班名"],
        class_seq: klass["班序"],
        seat_no: stu["座號"]
      });
    }
  }

  res.json(result);
});

module.exports = router;
