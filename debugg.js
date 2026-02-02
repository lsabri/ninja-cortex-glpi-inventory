const axios = require('axios');
const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;
let CREDENTIALS_PATH = process.env.CREDENTIALS_PATH; // utilisation de let pour pouvoir réassigner

console.log(`🔍 URL: ${NINJA_URL}`);
console.log(`🔍 AUTH_SECRET_NINJA: ${AUTH_SECRET_NINJA}`);
console.log(`🔍 CREDENTIALS_PATH avant correction: ${CREDENTIALS_PATH}`);

// Si le chemin commence par ~, on le remplace par le home
if (CREDENTIALS_PATH.startsWith('~')) {
  CREDENTIALS_PATH = path.join(os.homedir(), CREDENTIALS_PATH.slice(1));
}

console.log(`🔍 CREDENTIALS_PATH après correction: ${CREDENTIALS_PATH}`);


async function test() {
  try {
    const tokenResp = await axios.post(`${process.env.NINJA_URL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'client_credentials',
        client_id: process.env.CLIENT_ID_NINJA,
        client_secret: process.env.AUTH_SECRET_NINJA,
        scope: 'monitoring'
      }
    });

    const token = tokenResp.data.access_token;

    const resp = await axios.get(`${process.env.NINJA_URL}/api/v2/activities`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(JSON.stringify(resp.data, null, 2));
  } catch (e) {
    console.error(e.response?.data || e.message);
  }
}

test();
