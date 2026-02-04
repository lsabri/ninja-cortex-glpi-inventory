const axios = require('axios');
require('dotenv').config();

async function getDevice() {
    const { NINJA_URL, CLIENT_ID_NINJA, AUTH_SECRET_NINJA } = process.env;
    const deviceId = "8"; // <--- REMPLACE PAR UN ID REEL

    try {
        // 1. Auth
        const auth = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
            params: {
                grant_type: 'client_credentials',
                client_id: CLIENT_ID_NINJA,
                client_secret: AUTH_SECRET_NINJA,
                scope: 'monitoring'
            }
        });

        // 2. Fetch Computer
        const res = await axios.get(`${NINJA_URL}/v2/device/${deviceId}`, {
            headers: { Authorization: `Bearer ${auth.data.access_token}` }
        });

        // 3. Output brut
        console.log(JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}

getDevice();