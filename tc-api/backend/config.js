require("dotenv").config();

module.exports = {
    port: process.env.PORT || 3001,
    oauth: {
        token_url: process.env.OAUTH_TOKEN_URL,
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
    },
    school: {
        api_url: process.env.SCHOOL_API_URL
    }
};
