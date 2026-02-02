const axios = require('axios');
require('dotenv').config();

// --- CONFIG ---
const NINJA_URL = process.env.NINJA_URL.replace(/\/$/, "");
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

// --- Récupération du token ---
async function getAccessToken() {
  const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
    params: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID_NINJA,
      client_secret: AUTH_SECRET_NINJA,
      scope: 'monitoring management control'
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data.access_token;
}

// --- Timestamp UNIX il y a 7 jours ---
function getUnixTimeOneWeekAgo() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return Math.floor(oneWeekAgo.getTime() / 1000); // en secondes
}

(async () => {
  try {
    const token = await getAccessToken();
    const after = getUnixTimeOneWeekAgo();

    const resp = await axios.get(`${NINJA_URL}/api/v2/activities`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { pageSize: 500, after }
    });

    // --- Assurer qu'on travaille sur un tableau ---
    let activities = resp.data;
    if (!Array.isArray(activities)) {
      if (Array.isArray(activities.results)) {
        activities = activities.results;
      } else {
        console.error('❌ Impossible de trouver un tableau d’activités dans la réponse :', activities);
        return;
      }
    }

    // --- Filtrage des activités administratives ---
    const adminActivities = activities.filter(a =>
      ['SYSTEM', 'ACTION'].includes(a.activityType)
    );

    console.log(`🔹 Activités ADMIN de la semaine (${adminActivities.length}) :\n`);

    adminActivities.forEach((a, i) => {
      console.log(`${i + 1}. ID: ${a.id}`);
      console.log(`   Device ID: ${a.deviceId}`);
      console.log(`   Utilisateur: ${a.subject || "N/A"}`);
      console.log(`   Type: ${a.activityType}`);
      console.log(`   Source: ${a.sourceName}`);
      console.log(`   Statut: ${a.status}`);
      console.log(`   Date: ${new Date(a.activityTime * 1000).toLocaleString()}`);
      console.log(`   Message: ${a.message}\n`);
    });

  } catch (error) {
    console.error('❌ Erreur :', error.response?.data || error.message);
  }
})();
