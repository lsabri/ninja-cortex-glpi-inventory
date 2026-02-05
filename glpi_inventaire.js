const axios = require('axios');
const dotenv = require('dotenv');

// Configure le chemin vers le fichier .env
dotenv.config();

// ================= CONFIG =================
const GLPI_URL = process.env.GLPI_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;

// Debug des variables d'environnement
console.log('--- DEBUG ENV VARS ---');
console.log(`GLPI_URL:        ${GLPI_URL || '❌ NON DÉFINI'}`);
console.log(`GLPI_APP_TOKEN:  ${APP_TOKEN ? APP_TOKEN.substring(0, 5) + '...' : '❌ NON DÉFINI'}`);
console.log(`GLPI_USER_TOKEN: ${USER_TOKEN ? USER_TOKEN.substring(0, 5) + '...' : '❌ NON DÉFINI'}`);
console.log('----------------------\n');

if (!GLPI_URL || !APP_TOKEN || !USER_TOKEN) {
    console.error('ERREUR : Des variables sont manquantes dans le fichier .env');
    process.exit(1);
}

async function getSession() {
  try {
    const response = await axios.get(`${GLPI_URL}/initSession`, {
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN,
        'Authorization': `user_token ${USER_TOKEN}` 
      }
    });

    const sessionToken = response.data.session_token;
    console.log("✅ Session Token obtenu:", sessionToken);
    return sessionToken;
  } catch (error) {
    console.error("❌ Erreur d'auth :", error.response?.data || error.message);
  }
}

// Correction du "await" final pour CommonJS
getSession()
  .then(token => {
    if (token) console.log("Prêt pour la suite !");
  })
  .catch(err => {
    console.error("Erreur fatale:", err);
  });