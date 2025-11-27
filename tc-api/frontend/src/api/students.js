import axios from "axios";

const API_BASE = "http://localhost:3001/api";

export function fetchStudents() {
  return axios.get(`${API_BASE}/students`)
    .then(res => res.data.students);
}
