const axios = require("axios");
const qs = require("qs");
const config = require("../config");

let cachedToken = null;
let expire = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < expire) {
    return cachedToken;
  }

  const data = qs.stringify({
    grant_type: "client_credentials",
    client_id: config.oauth.client_id,
    client_secret: config.oauth.client_secret
  });

  const resp = await axios.post(config.oauth.token_url, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  cachedToken = resp.data.access_token;
  expire = now + resp.data.expires_in * 1000 - 5000; // 避免過期

  return cachedToken;
}

module.exports = { getAccessToken };
