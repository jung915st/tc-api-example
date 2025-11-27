import axios from "axios";

const API_BASE = "http://localhost:3001/api";

/**
 * Get current semester info
 */
export function getCurrentSemester() {
  console.log('[ScoresAPI] Fetching current semester from:', `${API_BASE}/scores/current-semester`);
  return axios.get(`${API_BASE}/scores/current-semester`)
    .then(res => {
      console.log('[ScoresAPI] Current semester response:', res.data);
      return res.data;
    });
}

/**
 * Get semester scores
 * @param {Object} params - { school_year, semester, grade, class_no }
 */
export function getSemesterScores(params) {
  console.log('[ScoresAPI] Fetching semester scores with params:', params);
  console.log('[ScoresAPI] API endpoint:', `${API_BASE}/scores/semester`);
  
  return axios.post(`${API_BASE}/scores/semester`, params)
    .then(res => {
      console.log('[ScoresAPI] Semester scores response:', {
        status: res.status,
        hasData: !!res.data,
        hasStudents: !!res.data?.students,
        studentCount: res.data?.students?.length || 0
      });
      return res.data;
    });
}
