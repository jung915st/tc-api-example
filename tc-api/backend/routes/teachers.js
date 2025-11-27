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
  const teacherList = data["學期教職員"] || [];

  const teacherMap = {};

  /* ---------------------------------------------
   ① 導師（從班級資料中偵測導師）
  ---------------------------------------------*/
  for (const klass of classes) {
    for (const t of klass["導師"] || []) {
      const key = `${t["UID"]}-${t["UID2"]}`;

      if (!teacherMap[key]) {
        teacherMap[key] = {
          name: t["姓名"],
          uid: t["UID"],
          uid2: t["UID2"],
          id_hash: t["身分證編碼"],
          office: "",       // 處室
          title: "",        // 職稱
          isHomeroom: true, // ★ 導師標記
          subjects: {}
        };
      }

      const k = `${klass["年級"]}-${klass["班序"]}`;
      if (!teacherMap[key].subjects[k]) {
        teacherMap[key].subjects[k] = [];
      }
    }
  }

  /* ---------------------------------------------
   ② 任教科目（從教師資料 teacherList）
  ---------------------------------------------*/
  for (const t of teacherList) {
    const key = `${t["UID"]}-${t["UID2"]}`;

    if (!teacherMap[key]) {
      teacherMap[key] = {
        name: t["姓名"],
        uid: t["UID"],
        uid2: t["UID2"],
        id_hash: t["身分證編碼"],
        office: t["處室"] || "",
        title: t["職稱"] || "",
        isHomeroom: false,
        subjects: {}
      };
    } else {
      // 更新處室與職稱
      teacherMap[key].office = t["處室"] || "";
      teacherMap[key].title  = t["職稱"] || "";
    }

    // 任教科目
    for (const sub of t["任教科目"] || []) {
      const k = `${sub["年級"]}-${sub["班序"]}`;

      if (!teacherMap[key].subjects[k]) {
        teacherMap[key].subjects[k] = [];
      }

      teacherMap[key].subjects[k].push({
        科目: sub["科目"],
        時數: sub["時數"]
      });
    }
  }

  /* ---------------------------------------------
   ③ 整理成前端格式
  ---------------------------------------------*/
  const output = Object.values(teacherMap).map(t => ({
    name: t.name,
    uid: t.uid,
    uid2: t.uid2,
    office: t.office,
    title: t.title,
    isHomeroom: t.isHomeroom,
    classes: Object.entries(t.subjects).map(([key, subjects]) => {
      const [grade, class_seq] = key.split("-");
      return {
        grade: Number(grade),
        class_seq: Number(class_seq),
        subjects
      };
    })
  }));

  res.json(output);
});

module.exports = router;
