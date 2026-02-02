const axios = require('axios');
require('dotenv').config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

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
    console.error('❌ Erreur lors de l\'obtention du token :', error.message);
    return null;
  }
}

// === FONCTION POUR LIRE TOUS LES ADMINS ===
async function getAdminUsers() {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Échec de l'authentification");

    const resp = await axios.get(`${NINJA_URL}/api/v2/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const users = resp.data;

    // Filtrer uniquement les admins
    const admins = users.filter(u => u.administrator === true);

    console.log('✅ Utilisateurs administrateurs (avec tous les champs) :');
    admins.forEach((admin, i) => {
      console.log(`\n--- Admin #${i + 1} ---`);
      console.log(admin); // Affiche tous les champs pour voir les noms exacts
    });

    return admins;

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des admins :', error.response?.data || error.message);
    return [];
  }
}

// === EXÉCUTION ===
getAdminUsers();
