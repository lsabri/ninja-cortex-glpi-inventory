const axios = require('axios');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');

process.chdir(__dirname);
dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

const AUTH_ID_CORTEX = process.env.AUTH_ID_CORTEX;
const AUTH_TOKEN_CORTEX = process.env.AUTH_TOKEN_CORTEX;
const URL_CORTEX = process.env.URL_CORTEX;

const GLPI_URL = process.env.GLPI_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;
const agentGLPI = new https.Agent({ rejectUnauthorized: false });

const GLPI_IDS = {
    NAME: 1,
    STATUS: 31,
    OS_NAME: 45,
    OS_VERSION: 46,
    OS_BUILD: 161,
    AGENT_UA: 5160,
    FUSINV_CONTACT: 5150
};

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_NINJA = process.env.SHEET_NAME_NINJA;
const SHEET_NAME_CORTEX = process.env.SHEET_NAME_CORTEX;
const SHEET_NAME_GLPI = process.env.SHEET_NAME_GLPI;
const SHEET_NAME_COMPARE = 'COMPARE';
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

let CREDENTIALS_PATH = CREDENTIALS_PATH_ENV.startsWith('~') 
  ? path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1)) 
  : CREDENTIALS_PATH_ENV;

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "100", 10);

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const LOG_FILE = path.join(logDir, 'Ninja-Cortex-GLPI-Inventaire.log');

// ----------------- UTILS -----------------
function log(message) {
  const date = new Date().toLocaleString('fr-FR');
  const line = `[${date}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

/**
 * Normalisation Date (Timestamp -> JJ/MM/AAAA HH:mm)
 */
function formatTimestamp(ms, isCortex = false) {
  if (!ms) return "N/A";
  const date = new Date(isCortex ? ms : ms * 1000);
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/**
 * Normalisation Date SQL GLPI (YYYY-MM-DD HH:MM:SS -> JJ/MM/AAAA HH:mm)
 */
function normalizeGlpiDate(dateStr) {
    if (!dateStr || dateStr === "N/A" || dateStr === "null") return "N/A";
    try {
        const [datePart, timePart] = dateStr.split(' ');
        const [y, m, d] = datePart.split('-');
        const [hh, mm] = timePart.split(':');
        return `${d}/${m}/${y} ${hh}:${mm}`;
    } catch (e) { return dateStr; }
}

function translateBuild(build, currentVersion, osName = "") {
    const cleanBuild = (build && build !== "N/A") ? String(build).split('.').pop().trim() : "";
    const cleanVersion = (currentVersion && currentVersion !== "N/A") ? String(currentVersion).trim() : "";
    const name = String(osName).toUpperCase();

    const map = {
        "22000": "21H2", "22621": "22H2", "22631": "23H2", "26100": "24H2",
        "26200": "25H2", "19041": "2004", "19042": "20H2", "19043": "21H1",
        "19044": "21H2", "19045": "22H2"
    };

    if (cleanBuild && map[cleanBuild]) return map[cleanBuild];
    if (cleanBuild !== "") return `Build ${cleanBuild}`;

    if (cleanVersion === "2009" || cleanVersion === "") {
        if (name.includes("WINDOWS 11")) return "W11 (v.2009)";
        if (name.includes("WINDOWS 10")) return "W10 (v.2009)";
        return "Inconnu (Agent)";
    }
    return cleanVersion || "N/A";
}

// ----------------- GOOGLE SHEETS -----------------
async function writeToSheet(rows, sheetName) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A:G` });

    const headers = ['ID', 'Nom', 'OS', 'OS Release', 'Agent Version', 'Last Contact/Seen'];
    const updateLine = [`Dernière mise à jour : ${new Date().toLocaleString('fr-FR', {hour12: false})}`, '', '', '', '', ''];

    const values = [updateLine, headers, ...rows];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: { values }
    });
    log(`✅ Écriture terminée dans ${sheetName}`);
  } catch (err) {
    log(`❌ Erreur Sheets (${sheetName}) : ${err.message}`);
  }
}

// ----------------- NINJA (Version demandée) -----------------
async function getAccessToken() {
  try {
    const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: { grant_type: 'client_credentials', client_id: CLIENT_ID_NINJA, client_secret: AUTH_SECRET_NINJA, scope: 'monitoring' }
    });
    return resp.data.access_token;
  } catch (err) { log('❌ Erreur token NinjaOne :', err.message); return null; }
}

async function getDeviceOS(deviceId, token) {
  try {
    const resp = await axios.get(`${NINJA_URL}/v2/device/${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const device = resp.data;
    return {
      osName: device.os?.name || "OS inconnu",
      osRelease: device.os?.releaseId || "N/A"
    };
  } catch (err) {
    log(`❌ Impossible de récupérer OS du device ${deviceId}:`, err.message);
    return { osName: "OS inconnu", osRelease: "N/A" };
  }
}

async function getNinjaDevices() {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const resp = await axios.get(`${NINJA_URL}/v2/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const devices = resp.data;
    log(`🖥️ ${devices.length} devices Ninja récupérés`);

    const rows = [];
    for (const d of devices) {
      const name = d.systemName || d.hostname || d.displayName || "(nom inconnu)";
      const lastContact = formatTimestamp(d.lastContact);

      const osInfo = await getDeviceOS(d.id, token);
      const osName = osInfo.osName;
      // Normalisation du Release Ninja via translateBuild
      const osRelease = translateBuild(osInfo.osRelease, osInfo.osRelease, osName);

      let agentVersion = "Inconnue";
      try {
        const customResp = await axios.get(`${NINJA_URL}/v2/device/${d.id}/custom-fields`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        agentVersion = customResp.data.versionAgentNinjaone || "Inconnue";
      } catch (errCustom) {
        log(`⚠️ Champ agent Ninja inconnu pour ${name}`);
      }

      rows.push([d.id, name, osName, osRelease, agentVersion, lastContact]);
    }

    await writeToSheet(rows, SHEET_NAME_NINJA);
    log(`Export Ninja terminé : ${rows.length} lignes.`);
  } catch (err) {
    log('❌ Erreur NinjaOne :', err.message);
  }
}

// ----------------- CORTEX (Inchangé) -----------------
function windowsReleaseToHVersion(osVersion) {
  if (!osVersion) return "N/A";
  const build = osVersion.split('.').pop();
  const map = {
    "22000": "21H2", "22621": "22H2", "22631": "23H2", "26100": "24H2",
    "26200": "25H2", "19041": "2004", "19042": "20H2", "19043": "21H1",
    "19044": "21H2", "19045": "22H2"
  };
  return map[build] || "Version inconnue";
}

async function getCortexDevices() {
  log(`🛡️ Début Cortex XDR...`);
  let offset = 0;
  const allRows = [];
  while (true) {
    try {
      const resp = await axios.post(URL_CORTEX,
        { request_data: { filters: [], search_from: offset, search_to: offset + PAGE_SIZE } },
        { headers: { "x-xdr-auth-id": AUTH_ID_CORTEX, Authorization: AUTH_TOKEN_CORTEX, "Content-Type": "application/json" } }
      );
      const endpoints = resp.data.reply.endpoints || [];
      endpoints.forEach(e => {
        const osNameRaw = e.operating_system || "";
        if (!osNameRaw.toUpperCase().includes("WINDOWS") || osNameRaw.toUpperCase().includes("SERVER")) return;
        const osRelease = windowsReleaseToHVersion(e.os_version);
        allRows.push([e.endpoint_id, e.endpoint_name, osNameRaw, osRelease, e.endpoint_version, formatTimestamp(e.last_seen, true)]);
      });
      if (endpoints.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    } catch (err) { break; }
  }
  await writeToSheet(allRows, SHEET_NAME_CORTEX);
}

// ----------------- GLPI -----------------
async function getGlpiSession() {
    const res = await axios.get(`${GLPI_URL}/initSession`, {
        headers: { 'App-Token': APP_TOKEN, 'Authorization': `user_token ${USER_TOKEN}` },
        httpsAgent: agentGLPI
    });
    return res.data.session_token;
}

async function getGlpiDevices() {
    log(`📦 Début GLPI Inventory...`);
    try {
        const token = await getGlpiSession();
        let allRows = [];
        let start = 0;
        let totalCount = 1;
        while (start < totalCount) {
            const response = await axios.get(`${GLPI_URL}/search/Computer`, {
                params: {
                    'criteria[0][field]': GLPI_IDS.STATUS, 'criteria[0][searchtype]': 'contains', 'criteria[0][value]': 'Installé',
                    'criteria[1][link]': 'AND', 'criteria[1][field]': GLPI_IDS.OS_NAME, 'criteria[1][searchtype]': 'contains', 'criteria[1][value]': 'Windows',
                    'forcedisplay[0]': 2, 'forcedisplay[1]': GLPI_IDS.NAME, 'forcedisplay[2]': GLPI_IDS.OS_NAME,
                    'forcedisplay[3]': GLPI_IDS.OS_VERSION, 'forcedisplay[4]': GLPI_IDS.OS_BUILD,
                    'forcedisplay[5]': GLPI_IDS.AGENT_UA, 'forcedisplay[6]': GLPI_IDS.FUSINV_CONTACT,
                    'range': `${start}-${start + PAGE_SIZE - 1}`
                },
                headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                httpsAgent: agentGLPI
            });
            totalCount = response.data.totalcount;
            response.data.data.forEach(c => {
                const osName = c[GLPI_IDS.OS_NAME];
                const realRelease = translateBuild(c[GLPI_IDS.OS_BUILD], c[GLPI_IDS.OS_VERSION], osName);
                const rawAgent = String(c[GLPI_IDS.AGENT_UA] || "N/A").split('/')[0].split(' ')[0];
                const agentVer = rawAgent.replace('FusionInventory-Agent_', '');
                const lastContact = normalizeGlpiDate(c[GLPI_IDS.FUSINV_CONTACT]);
                allRows.push([c[2], c[1], osName, realRelease, agentVer, lastContact]);
            });
            start += PAGE_SIZE;
        }
        await writeToSheet(allRows, SHEET_NAME_GLPI);
    } catch (err) { log('❌ Erreur GLPI :', err.message); }
}

// ----------------- COMPARE -----------------
async function buildCompareSheet() {
  try {
    const auth = new google.auth.GoogleAuth({ keyFile: CREDENTIALS_PATH, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    log("📊 Construction synthèse COMPARE...");
    const [ninja, cortex, glpi] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: SHEET_NAME_NINJA }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: SHEET_NAME_CORTEX }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: SHEET_NAME_GLPI })
    ]);

    const maps = { ninja: {}, cortex: {}, glpi: {} };
    const processRows = (rows, map) => {
        if (!rows) return;
        for (let i = 2; i < rows.length; i++) { if (rows[i][1]) map[rows[i][1].toUpperCase()] = rows[i][5] || 'Oui'; }
    };
    processRows(ninja.data.values, maps.ninja);
    processRows(cortex.data.values, maps.cortex);
    processRows(glpi.data.values, maps.glpi);

    const all = new Set([...Object.keys(maps.ninja), ...Object.keys(maps.cortex), ...Object.keys(maps.glpi)]);
    const result = [['Nom device', 'Ninja?', 'Last Contact Ninja', 'Cortex?', 'Last Seen Cortex', 'GLPI?', 'Last Contact GLPI']];
    for (const name of Array.from(all).sort()) {
      result.push([name, maps.ninja[name] ? 'Oui' : 'Non', maps.ninja[name] || '', maps.cortex[name] ? 'Oui' : 'Non', maps.cortex[name] || '', maps.glpi[name] ? 'Oui' : 'Non', maps.glpi[name] || '']);
    }

    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: SHEET_NAME_COMPARE });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_COMPARE}!A1`,
      valueInputOption: 'RAW',
      resource: { values: [[`Dernière mise à jour : ${new Date().toLocaleString('fr-FR', {hour12: false})}`], ...result] }
    });
  } catch (err) { log(`❌ Erreur Synthèse : ${err.message}`); }
}

// ----------------- MAIN -----------------
async function main() {
  log(`🚀 DÉMARRAGE INVENTAIRE GLOBAL`);
  //await getNinjaDevices();
  await getCortexDevices();
  //await getGlpiDevices();
  //await buildCompareSheet();
  log(`🏁 FIN EXÉCUTION`);
}

main();