const axios = require("axios");
require("dotenv").config();

const AUTH_ID = process.env.AUTH_ID_CORTEX.trim();
const AUTH_TOKEN = process.env.AUTH_TOKEN_CORTEX.trim();
const BASE_URL = "https://api-groupelemonde.xdr.eu.paloaltonetworks.com/public_api/v1";

// XQL pour récupérer les groupes d'un endpoint précis
const ENDPOINT_NAME = "CIPO10027";
const XQL_QUERY = `
dataset = endpoints
| filter endpoint_name = "${ENDPOINT_NAME}"
| filter group_names != null
| arrayexpand group_names
| dedup group_names
| sort asc group_names
| fields group_names
`;

// Petite fonction pour attendre
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getEndpointGroups() {
  try {
    // 1️⃣ Lancer la requête XQL
    const startResp = await axios.post(
      `${BASE_URL}/xql/start_xql_query`,
      { request_data: { query: XQL_QUERY, time_frame: { from: 0, to: Date.now() } } },
      { headers: { "x-xdr-auth-id": AUTH_ID, "Authorization": AUTH_TOKEN, "Content-Type": "application/json" } }
    );

    const queryId = startResp.data.reply;
    if (!queryId) {
      console.error("❌ Aucun query_id retourné !", startResp.data);
      return;
    }
    console.log("Query ID:", queryId);

    // 2️⃣ Polling pour récupérer le résultat
    let status = "PENDING";
    let resultsRaw = [];
    while (status === "PENDING" || status === "RUNNING") {
      await sleep(2000);

      const statusResp = await axios.post(
        `${BASE_URL}/xql/get_query_results`,
        { request_data: { query_id: queryId, limit: 1000 } },
        { headers: { "x-xdr-auth-id": AUTH_ID, "Authorization": AUTH_TOKEN, "Content-Type": "application/json" } }
      );

      const reply = statusResp.data.reply;
      status = reply.status;

      if (status === "SUCCESS") {
        // Cortex XDR peut renvoyer les résultats dans reply.results.data
        if (Array.isArray(reply.results)) {
          resultsRaw = reply.results;
        } else if (reply.results?.data) {
          resultsRaw = reply.results.data;
        } else {
          resultsRaw = [];
        }
        break;
      }

      console.log("⏳ Status:", status);
    }

    // 3️⃣ Extraire un tableau simple de noms de groupes
    const groupes = resultsRaw
      .map(r => r.group_names || r.data?.group_names)
      .filter(Boolean); // enlever les null/undefined

    console.log(`\n✅ Groupes de l'endpoint ${ENDPOINT_NAME} :`);
    console.log(groupes);

  } catch (err) {
    console.error("❌ Erreur :", err.response?.status || err.message);
    if (err.response?.data) console.log("Détail :", JSON.stringify(err.response.data, null, 2));
  }
}

getEndpointGroups();