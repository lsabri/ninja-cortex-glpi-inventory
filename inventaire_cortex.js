const dotenv = require("dotenv");
const axios = require("axios");
const { google } = require('googleapis');

dotenv.config(); // charge toutes les variables du .env

// ----------------- CONFIG CORTEX -----------------
const AUTH_ID = process.env.AUTH_ID;
const AUTH_TOKEN = process.env.AUTH_TOKEN_CORTEX;
const URL = process.env.URL_CORTEX;
const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "100", 10);

// ----------------- CONFIG GOOGLE -----------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME_CORTEX;
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;

// ----------------- UTIL -----------------
function formatTimestamp(ms) {
  if (!ms) return "N/A";
  return new Date(ms).toLocaleString(); // Convertit en date lisible
}

function formatEndpoint(endpoint) {
  const lastSeen = formatTimestamp(endpoint.last_seen);
  return [
    endpoint.endpoint_id || "(ID inconnu)",
    endpoint.endpoint_name || "(Nom inconnu)",
    endpoint.endpoint_version || "(Version inconnue)",
    lastSeen
  ];
}

// ----------------- GOOGLE SHEETS -----------------
async function writeToSheet(rows) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    console.log(`📝 Tentative d'écriture de ${rows.length} lignes dans la feuille "${SHEET_NAME}"...`);

    // Test d'écriture pour vérifier l'auth
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME + '!A1',
      valueInputOption: 'RAW',
      resource: { values: [['Test Auth OK']] }
    });
    console.log('✅ Test d’écriture réussi (authentification OK)');

    // Vider la feuille avant d’écrire les données
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME
    });

    // Écriture des entêtes + données
    const values = [
      ['ID', 'Nom', 'Version', 'LastSeen'],
      ...rows
    ];

    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
      valueInputOption: 'RAW',
      resource: { values }
    });

    console.log('✅ Écriture terminée', res.status, res.statusText);

  } catch (err) {
    console.error('❌ Erreur lors de l’écriture dans Google Sheets :', err.message, err.errors || '');
  }
}

// ----------------- RÉCUPÉRATION DES ENDPOINTS -----------------
async function fetchAndWriteDevices() {
  console.log(`Début exécution Cortex XDR le ${new Date().toLocaleString()}`);
  let offset = 0;
  const allRows = [];

  while (true) {
    try {
      const response = await axios.post(
        URL,
        {
          request_data: {
            filters: [],
            search_from: offset,
            search_to: offset + PAGE_SIZE
          }
        },
        {
          headers: {
            "x-xdr-auth-id": AUTH_ID,
            Authorization: AUTH_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );

      const data = response.data;
      const endpoints = data.reply.endpoints || [];
      const result_count = data.reply.result_count || 0;
      const total_count = data.reply.total_count || 0;

      // Préparer les lignes pour Google Sheets
      endpoints.forEach(endpoint => {
        allRows.push(formatEndpoint(endpoint));
        // Affichage console
        console.log(formatEndpoint(endpoint).join(' | '));
      });

      if (result_count < PAGE_SIZE || offset >= total_count) break;
      offset += PAGE_SIZE;

    } catch (err) {
      console.error("❌ Erreur lors de la récupération des devices Cortex:", err.message);
      break;
    }
  }

  await writeToSheet(allRows);

  console.log(`Fin exécution Cortex XDR le ${new Date().toLocaleString()}`);
}

// ----------------- EXEC -----------------
fetchAndWriteDevices();
