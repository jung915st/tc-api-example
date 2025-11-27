// services/schoolApi.js
const axios = require("axios");
const config = require("../config");
const { getAccessToken } = require("./oauthClient");

async function getSchoolSemesterData() {
    const token = await getAccessToken();

    const resp = await axios.get(`${config.school.api_url}/semester-data`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return resp.data; // 假設 API 回傳學生陣列
}

module.exports = { getSchoolSemesterData };
