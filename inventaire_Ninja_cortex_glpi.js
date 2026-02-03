const axios = require('axios');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const fs = require('fs');
const os = require('os');
const path = require('path');

dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

const AUTH_ID_CORTEX = process.env.AUTH_ID;
const AUTH_TOKEN_CORTEX = process.env.AUTH_TOKEN_CORTEX;
const URL_CORTEX = process.env.URL_CORTEX;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_NINJA = process.env.SHEET_NAME_NINJA;
const SHEET_NAME_CORTEX = process.env.SHEET_NAME_CORTEX;
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

let CREDENTIALS_PATH = CREDENTIALS_PATH_ENV.startsWith('~') 
  ? path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1)) 
  : CREDENTIALS_PATH_ENV;

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "100", 10);

// ----------------- LOGGING -----------------
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'inventaire_Ninja_cortex.log');

function writeLog(message) {
  const timestamp = new Date().toLocaleString('fr-FR');
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

// ----------------- UTIL -----------------
function formatTimestamp(ms, isCortex = false) {
  if (!ms) return "N/A";
  return new Date(isCortex ? ms : ms * 1000).toLocaleString('fr-FR');
}

// ----------------- GOOGLE SHEETS -----------------
async function writeToSheet(rows, sheetName) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ 
      spreadsheetId: SPREADSHEET_ID, 
      range: `${sheetName}!A:F` 
    });

    const headers = sheetName === SHEET_NAME_NINJA
      ? ['ID', 'Nom', 'OS', 'OS Release', 'Agent Version', 'Last Contact']
      : ['ID', 'Nom', 'OS', 'OS Release', 'Agent Version', 'Last Seen'];

    const values = [
      headers,
      ...rows     
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: { values }
    });

    writeLog(`✅ Écriture terminée dans ${sheetName} (${rows.length} lignes)`);

  } catch (err) {
    writeLog(`❌ Erreur Google Sheets (${sheetName}) : ${err.message}`);
  }
}

// ----------------- NINJA -----------------
async function getAccessToken() {
  try {
    const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID_NINJA,
        client_secret: AUTH_SECRET_NINJA,
        scope: 'monitoring'
      }
    });
    return resp.data.access_token;
  } catch (err) {
    writeLog(`❌ Erreur token NinjaOne : ${err.response?.data || err.message}`);
    return null;
  }
}

async function getNinjaDevices() {
  const token = await getAccessToken();
  if (!token) {
    writeLog('❌ Impossible de récupérer le token NinjaOne, arrêt du script.');
    return [];
  }

  try {
    const resp = await axios.get(`${NINJA_URL}/v2/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const devices = resp.data;
    writeLog(`🖥️ Nombre de machines Ninja récupérées : ${devices.length}`);

    const rows = [];
    for (const d of devices) {
      const name = d.systemName || d.hostname || d.displayName || "(nom inconnu)";
      const lastContact = formatTimestamp(d.lastContact);
      let agentVersion = "Inconnue";
      try {
        const customResp = await axios.get(`${NINJA_URL}/v2/device/${d.id}/custom-fields`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        agentVersion = customResp.data.versionAgentNinjaone || "Inconnue";
      } catch (errCustom) {
        writeLog(`⚠️ Impossible de récupérer versionAgentNinjaone pour ${name}`);
      }

      rows.push([d.id, name, d.os?.name || "OS inconnu", d.os?.releaseId || "N/A", agentVersion, lastContact]);
    }

    await writeToSheet(rows, SHEET_NAME_NINJA);
    return rows.length;
  } catch (err) {
    writeLog(`❌ Erreur NinjaOne : ${err.response?.data || err.message}`);
    return 0;
  }
}

// ----------------- CORTEX -----------------
function windowsReleaseToHVersion(osVersion) {
  if (!osVersion) return "N/A";
  const build = osVersion.split('.').pop();
  const map = {
    "22000": "21H2",
    "22621": "22H2",
    "22631": "23H2",
    "26100": "24H2",
    "26200": "25H2",
    "19041": "2004",
    "19042": "20H2",
    "19043": "21H1",
    "19044": "21H2",
    "19045": "22H2"
  };
  return map[build] || "Version inconnue";
}

async function getCortexDevices() {
  let offset = 0;
  const allRows = [];
  let cortexCount = 0;

  while (true) {
    try {
      const resp = await axios.post(
        URL_CORTEX,
        { request_data: { filters: [], search_from: offset, search_to: offset + PAGE_SIZE } },
        { headers: { "x-xdr-auth-id": AUTH_ID_CORTEX, Authorization: AUTH_TOKEN_CORTEX, "Content-Type": "application/json" } }
      );

      const endpoints = resp.data.reply.endpoints || [];
      endpoints.forEach(e => {
        const osNameRaw = e.operating_system || e.os_name || "";
        const osNameUpper = osNameRaw.toUpperCase();
        if (!osNameUpper.includes("WINDOWS")) return;
        if (osNameUpper.includes("WINDOWS SERVER") || osNameUpper.includes("AGENT_OS_LINUX") || osNameUpper.includes("AGENT_OS_MAC")) return;

        cortexCount++;
        allRows.push([
          e.endpoint_id || "(ID inconnu)",
          e.endpoint_name || "(Nom inconnu)",
          osNameRaw.replace(/Microsoft\s*/i,"").trim(),
          windowsReleaseToHVersion(e.os_version),
          e.endpoint_version || "(Version agent inconnue)",
          formatTimestamp(e.last_seen,true)
        ]);
      });

      const result_count = resp.data.reply.result_count || 0;
      const total_count = resp.data.reply.total_count || 0;
      if (result_count < PAGE_SIZE || offset >= total_count) break;
      offset += PAGE_SIZE;
    } catch (err) {
      writeLog(`❌ Erreur Cortex XDR : ${err.message}`);
      break;
    }
  }

  await writeToSheet(allRows, SHEET_NAME_CORTEX);
  writeLog(`💻 Nombre de machines Cortex récupérées : ${cortexCount}`);
  return cortexCount;
}

// ----------------- MAIN -----------------
async function main() {
  writeLog('🚀 Début exécution globale du script');
  const ninjaCount = await getNinjaDevices();
  const cortexCount = await getCortexDevices();
  writeLog(`🏁 Fin exécution globale. Résultats : Ninja=${ninjaCount}, Cortex=${cortexCount}`);
  writeLog(` ------------------------------------`);
}

main();
