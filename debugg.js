const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

// ----------------- TOKEN -----------------
async function getAccessToken() {
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID_NINJA,
      client_secret: AUTH_SECRET_NINJA,
      scope: 'monitoring management control'
    });

    const resp = await axios.post(
      `${NINJA_URL}/ws/oauth/token`,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return resp.data.access_token;
  } catch (err) {
    console.error('❌ Token KO :', err.response?.data || err.message);
    return null;
  }
}

// ----------------- CUSTOM FIELDS DEVICE -----------------
async function getDeviceCustomFields(deviceId) {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const resp = await axios.get(
      `${NINJA_URL}/v2/device/${deviceId}/custom-fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`🔍 Custom fields du device ID ${deviceId} :`);
    console.log(JSON.stringify(resp.data, null, 2));

    // affichage lisible
    if (Array.isArray(resp.data)) {
      console.log('\n📋 Liste lisible :');
      resp.data.forEach(f => {
        console.log(`- ${f.name || f.key} : ${f.value}`);
      });
    }

  } catch (err) {
    console.error(
      `❌ Erreur récupération custom fields pour ${deviceId} :`,
      err.response?.data || err.message
    );
  }
}

// ----------------- EXEC -----------------
const DEVICE_ID = 1492; // 🔁 remplace par le bon ID
// TARATTA//
getDeviceCustomFields(DEVICE_ID);
