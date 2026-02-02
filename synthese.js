const axios = require('axios');
const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

let CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;
if (CREDENTIALS_PATH.startsWith('~')) {
  CREDENTIALS_PATH = path.join(os.homedir(), CREDENTIALS_PATH.slice(1));
}

console.log('🔍CREDENTIALS_PATH', CREDENTIALS_PATH);

// ----------------- NINJA ENDPOINT -----------------
const endpoint = '/api/v2/activities';

// === OBTENTION DU TOKEN ===
async function getAccessToken() {
  try {
    const response = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID_NINJA,
        client_secret: AUTH_SECRET_NINJA,
        scope: 'monitoring'
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Erreur lors de l\'obtention du jeton d\'accès :', error.message);
    return null;
  }
}

// === GET ACTIVITIES ET DEBUG ===
async function getAllActivities() {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Échec de l'authentification");

    const response = await axios.get(`${NINJA_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const rawData = response.data;

    // Trouver le tableau d'activités
    let activities = Array.isArray(rawData) ? rawData : Object.values(rawData).find(Array.isArray);
    if (!activities) throw new Error("Aucun tableau d'activités trouvé dans la réponse.");

    // Afficher toutes les activités pour inspection
    console.log('📦 Toutes les activités :', JSON.stringify(activities, null, 2));

    // Lister tous les utilisateurs et rôles présents
    const users = activities.map(a => ({
      userName: a.userName || a.user || 'N/A',
      userRole: a.userRole || a.role || 'N/A'
    }));
    console.log('🧾 Tous les utilisateurs/roles :', users);

    // Retourner les activités pour filtrage ultérieur
    return activities;

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des activités :',
      error.response?.data || error.message);
    return null;
  }
}

// === EXÉCUTION ===
getAllActivities();
