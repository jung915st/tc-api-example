// routes/classes.js
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
  const classes = data["學期編班"];

  const grades = [...new Set(classes.map(c => c["年級"]))];

  const classMap = {};
  for (const c of classes) {
    if (!classMap[c["年級"]]) classMap[c["年級"]] = [];
    classMap[c["年級"]].push({
      班序: c["班序"],
      班名: c["班名"]
    });
  }

  res.json({
    grades,
    classes: classMap
  });
});

module.exports = router;
