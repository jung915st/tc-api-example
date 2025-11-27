// services/scoreSemester.js
const axios = require("axios");
const config = require("../config");
const { getAccessToken } = require("./oauthClient");

/**
 * Get semester scores for students
 * @param {number} year - Academic year (e.g., 113, 114)
 * @param {number} semester - Semester (1 or 2)
 * @param {number} grade - Grade level
 * @param {number} class_no - Class number
 * @returns {Promise} - Processed score data
 */
async function getSemesterScores(year, semester, grade, class_no) {
    console.log('[ScoreSemester] Starting getSemesterScores');
    console.log('[ScoreSemester] Request params:', { year, semester, grade, class_no });
    
    const token = await getAccessToken();
    console.log('[ScoreSemester] OAuth token obtained:', token ? `${token.substring(0, 20)}...` : 'null');

    const apiUrl = `${config.school.api_url}/score-semester`;
    const requestBody = { year, semester, grade, class_no };
    
    console.log('[ScoreSemester] API URL:', apiUrl);
    console.log('[ScoreSemester] Request body:', requestBody);

    const resp = await axios.post(
        apiUrl,
        requestBody,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );

    console.log('[ScoreSemester] API response status:', resp.status);
    console.log('[ScoreSemester] API response data type:', typeof resp.data);
    console.log('[ScoreSemester] API response keys count:', Object.keys(resp.data || {}).length);

    // Process the API response data
    const apiData = resp.data;
    
    // Check if we have the expected data structure
    if (!apiData || typeof apiData !== 'object') {
        console.warn('[ScoreSemester] Invalid API data structure, returning empty array');
        return { students: [] };
    }

    // Convert object with numeric keys to array
    const studentsArray = Object.values(apiData);
    console.log('[ScoreSemester] Students array length:', studentsArray.length);
    
    if (studentsArray.length > 0) {
        console.log('[ScoreSemester] First student sample:', JSON.stringify(studentsArray[0], null, 2));
    }

    // Transform the API response into our expected format
    const students = studentsArray.map((student, index) => {
        console.log(`[ScoreSemester] Processing student ${index + 1}/${studentsArray.length}`);
        const studentData = {
            seat_no: student.座號 || student.seat_no,
            student_no: student.學號 || student.student_no,
            name: student.姓名 || student.name
        };
        
        console.log(`[ScoreSemester] Student data:`, studentData);

        // Extract scores from nested structure
        const scores = [];
        const scoresData = student.成績 || student.scores || {};
        console.log(`[ScoreSemester] Scores data categories:`, Object.keys(scoresData));

        // Iterate through categories (語文, 數學, etc.)
        for (const [category, subjects] of Object.entries(scoresData)) {
            console.log(`[ScoreSemester] Processing category: ${category}, subjects:`, Object.keys(subjects || {}));
            if (typeof subjects === 'object' && subjects !== null) {
                // Iterate through subjects within each category
                for (const [subject, score] of Object.entries(subjects)) {
                    scores.push({
                        subject: subject,
                        score: typeof score === 'number' ? score : parseFloat(score) || 0
                    });
                }
            }
        }

        studentData.scores = scores;
        console.log(`[ScoreSemester] Student ${studentData.name} has ${scores.length} scores`);
        return studentData;
    });

    console.log('[ScoreSemester] Processing complete');
    console.log('[ScoreSemester] Total students processed:', students.length);
    console.log('[ScoreSemester] Sample subjects:', students[0]?.scores.map(s => s.subject).join(', '));

    return { students };
}

/**
 * Calculate current semester based on date
 * @returns {Object} - {year, semester}
 */
function getCurrentSemester() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth() + 1; // 0-11 -> 1-12

    console.log('[ScoreSemester] getCurrentSemester called');
    console.log('[ScoreSemester] Current date:', now.toISOString());
    console.log('[ScoreSemester] Current year:', currentYear, 'Month:', month);

    // Taiwan academic year: year - 1911
    // Aug-Jan: 1st semester
    // Feb-Jul: 2nd semester
    let year = currentYear - 1911;
    let semester = 1;

    if (month >= 2 && month <= 7) {
        semester = 2;
    } else if (month >= 8) {
        year = currentYear - 1911;
        semester = 1;
    } else {
        // Jan: still in 1st semester of previous academic year
        year = currentYear - 1911 - 1;
        semester = 1;
    }

    console.log('[ScoreSemester] Calculated semester:', { year, semester });

    return { year, semester };
}

module.exports = { 
    getSemesterScores,
    getCurrentSemester
};
