// routes/scores.js
const express = require("express");
const router = express.Router();
const { getSemesterScores, getCurrentSemester } = require("../services/scoreSemester");

/**
 * GET /api/scores/current-semester
 * Get current semester info
 */
router.get("/current-semester", (req, res) => {
    console.log('[ScoresRoute] GET /api/scores/current-semester');
    try {
        const current = getCurrentSemester();
        console.log('[ScoresRoute] Current semester response:', current);
        res.json(current);
    } catch (error) {
        console.error('[ScoresRoute] Error in current-semester:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/scores-semester
 * Get semester scores
 * Body: { year, semester, grade, class_no }
 */
router.post("/semester", async (req, res) => {
    const startTime = Date.now();
    console.log('\n[ScoresRoute] ============================================');
    console.log('[ScoresRoute] POST /api/scores/semester');
    console.log('[ScoresRoute] Timestamp:', new Date().toISOString());
    
    try {
        const { year, semester, grade, class_no } = req.body;

        console.log('[ScoresRoute] Request body:', req.body);
        console.log('[ScoresRoute] Parsed params:', { year, semester, grade, class_no });

        if (!year || !semester || !grade || !class_no) {
            console.warn('[ScoresRoute] Missing required fields');
            return res.status(400).json({ 
                error: "Missing required fields: year, semester, grade, class_no" 
            });
        }

        console.log('[ScoresRoute] Calling getSemesterScores...');
        const data = await getSemesterScores(year, semester, grade, class_no);
        
        const duration = Date.now() - startTime;
        console.log('[ScoresRoute] Request completed in', duration, 'ms');
        console.log('[ScoresRoute] Response summary:', {
            year, semester, grade, class_no,
            studentCount: data.students?.length || 0,
            subjectCount: data.students?.[0]?.scores?.length || 0
        });
        console.log('[ScoresRoute] ============================================\n');
        
        res.json(data);
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('[ScoresRoute] ============================================');
        console.error('[ScoresRoute] Error after', duration, 'ms');
        console.error('[ScoresRoute] Error type:', error.name);
        console.error('[ScoresRoute] Error message:', error.message);
        console.error('[ScoresRoute] Error stack:', error.stack);
        console.error('[ScoresRoute] ============================================\n');
        
        res.status(500).json({ 
            error: "Failed to fetch semester scores",
            message: error.message,
            type: error.name
        });
    }
});

module.exports = router;
