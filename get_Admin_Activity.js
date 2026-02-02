const axios = require('axios');
require('dotenv').config();

// --- CONFIG ---
const NINJA_URL = process.env.NINJA_URL.replace(/\/$/, "");
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

// --- TOKEN ---
async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID_NINJA,
    client_secret: AUTH_SECRET_NINJA,
    scope: 'monitoring management control',
  });

  const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return resp.data.access_token;
}

// --- Date ISO il y a 7 jours ---
function getIsoOneWeekAgo() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return oneWeekAgo.toISOString();
}

// --- NORMALISATION DE LA LISTE D'ACTIVITES ---
function extractActivities(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  console.error('❌ Impossible de trouver un tableau dactivites dans la reponse :', data);
  return [];
}

// --- MAIN ---
(async () => {
  try {
    const token = await getAccessToken();
    const after = getIsoOneWeekAgo();

    const resp = await axios.get(`${NINJA_URL}/api/v2/activities`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        pageSize: 500,
        after,
      },
    });

    let activities = extractActivities(resp.data);
    if (!activities.length) {
      console.log('Aucune activite trouvee (verifie le parametre `after`).');
      return;
    }

    // === VALEURS UNIQUES activityType SEULEMENT ===
    const uniqueTypes = [...new Set(activities.map(a => a.activityType).filter(Boolean))].sort();
    console.log('\n🎯 activityType UNIQUES :');
    uniqueTypes.forEach((type, i) => console.log(`${i+1}. ${type}`));
    console.log('');

    // === Filtre SYSTEM + SCRIPT uniquement ===
    const TYPES_A_GARDER = ["SYSTEM", "SCRIPT"];
    
    const adminActivities = activities.filter(a => {
      if (!a.activityType) return false;
      const type = String(a.activityType).toUpperCase();
      return TYPES_A_GARDER.includes(type);
    });

    console.log(`\n🔹 Activites SYSTEM / SCRIPT (${adminActivities.length}) :\n`);

    if (adminActivities.length === 0) {
      console.log('💡 INFO : Aucun SYSTEM/SCRIPT trouve. Regarde les types ci-dessus.');
    } else {
      adminActivities.forEach((a, i) => {
        const time = a.activityTime
          ? new Date(
              Number(a.activityTime) > 10_000_000_000
                ? Number(a.activityTime)
                : Number(a.activityTime) * 1000
            ).toLocaleString()
          : 'N/A';

        console.log(`${i + 1}. ID: ${a.id}`);
        console.log(`   Device ID: ${a.deviceId}`);
        console.log(`   Utilisateur: ${a.subject || "N/A"}`);
        console.log(`   Type: ${a.activityType}`);
        console.log(`   Source: ${a.sourceName}`);
        console.log(`   Statut: ${a.status}`);
        console.log(`   Date: ${time}`);
        console.log(`   Message: ${a.message}\n`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur :', error.response?.data || error.message);
  }
})();
