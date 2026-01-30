const axios = require('axios');

const clientID = 'D-7cnrPu5Kmlhj0BoFFJ4TYa5QE';
const secret = 'QfTNTGUDaLjxmFxzFeXwumDlvzq7rheah2xul1gp7XcfdKVxfy2zoQ';
const ninjaURL = 'https://eu.ninjarmm.com';
const endpoint = '/api/v2/activities';
const filter = '?filter=sourceName eq \'Exécuter Get_Printers\'';
// === OBTENTION DU TOKEN ===
async function getAccessToken() {
  try {
    const response = await axios.post(`${ninjaURL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'client_credentials',
        client_id: clientID,
        client_secret: secret,
        scope: 'monitoring'
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Erreur lors de l\'obtention du jeton d\'accès :', error.message);
    return null;
  }
}

// === GET ACTIVITIES (CORRIGÉ) ===
async function OLDgetActivity() {
    try {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error("Échec de l'authentification");
      }
  
      const response = await axios.get(`${ninjaURL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
  
      const activities = response.data;
      //console.log(activities);
    
      const filteredActivities = activities.filter(activity => 
        activity?.sourceName?.includes('Get_Printers') || 
        activity?.message?.includes('Get_Printers')
      );
  
      console.log('✅ Activités filtrées :', filteredActivities);
      return filteredActivities;
  
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des activités :', 
        error.response?.data || error.message);
      return null;
    }
  }
  

  async function getActivity() {
    try {
      const accessToken = await getAccessToken();
  
      if (!accessToken) {
        throw new Error("Échec de l'authentification");
      }
  
      const response = await axios.get(`${ninjaURL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
  
      const rawData = response.data;
  
      console.log('📦 Structure complète des données :', JSON.stringify(rawData, null, 2));
  
      // Rechercher automatiquement un tableau dans la réponse
      let activities = null;
  
      if (Array.isArray(rawData)) {
        activities = rawData;
      } else {
        // Cherche une clé qui contient un tableau
        for (const key in rawData) {
          if (Array.isArray(rawData[key])) {
            activities = rawData[key];
            break;
          }
        }
      }
  
      if (!activities) {
        throw new Error("Aucun tableau d'activités trouvé dans la réponse.");
      }
  
      const filteredActivities = activities.filter(activity =>
        activity?.sourceName?.includes('Get_Printers') ||
        activity?.message?.includes('Get_Printers')
      );
  
      console.log('✅ Activités filtrées :', filteredActivities);
      return filteredActivities;
  
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des activités :',
        error.response?.data || error.message);
      return null;
    }
  }
  
// === EXÉCUTION ===
getActivity();
