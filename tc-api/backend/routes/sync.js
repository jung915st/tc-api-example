// routes/sync.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { getSchoolSemesterData } = require("../services/schoolApi");

router.post("/", async (req, res) => {
  try {
    console.log("[SYNC] Fetching data from school API...");

    const data = await getSchoolSemesterData();

    if (!data ) {
      return res.status(400).json({
        success: false,
        message: "校務 API 回傳格式錯誤"
      });
    }

    const outputPath = path.join(__dirname, "../data/school.json");

    // 儲存成 JSON 檔
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");

    console.log("[SYNC] school.json updated.");

    res.json({
      success: true,
      message: "同步完成"
    });
  } catch (err) {
    console.error("[SYNC ERROR]", err);
    res.status(500).json({
      success: false,
      message: "同步失敗",
      error: err.message
    });
  }
});

module.exports = router;
