const axios = require('axios');

function registerUser(username, email, password) {
    return axios.post('https://your-backend-url/register', {
        username,
        email,
        password
    });
}

module.exports = registerUser