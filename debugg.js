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
