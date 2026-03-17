const axios = require("axios");
require("dotenv").config();

const AUTH_ID = process.env.AUTH_ID_CORTEX.trim();
const AUTH_TOKEN = process.env.AUTH_TOKEN_CORTEX.trim();
const BASE_URL = "https://api-groupelemonde.xdr.eu.paloaltonetworks.com/public_api/v1";

async function listPolicies() {
  try {
    const resp = await axios.post(
      `${BASE_URL}/policies/get_policies`,
      {
        request_data: {
          filters: [],  // tous les types de policies
          search_from: 0,
          search_to: 1000
        }
      },
      {
        headers: {
          "x-xdr-auth-id": AUTH_ID,
          "Authorization": AUTH_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const policies = resp.data?.reply?.policies || [];
    console.log(`📊 Total policies récupérées : ${policies.length}`);

    // Affichage minimal : nom et groupes assignés
    policies.forEach(p => {
      console.log(p.policy_name, p.groups || [], p.tags || []);
    });

    return policies;
  } catch (err) {
    console.error("❌ Erreur :", err.response?.status || err.message);
    if (err.response?.data) console.log("Détail :", JSON.stringify(err.response.data, null, 2));
    return [];
  }
}

listPolicies();