const axios = require('axios');
const dotenv = require('dotenv');
const { google } = require('googleapis');

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
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "100", 10);

// ----------------- UTIL -----------------
console.log("NINJA_URL =", process.env.NINJA_URL);
console.log("SPREADSHEET_ID =", process.env.SPREADSHEET_ID);


// 
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

    
    const updateLine = [`Dernière mise à jour : ${new Date().toLocaleString('fr-FR')}`, '', '', '', '', '', ''];

    const values = [
      updateLine, 
      headers,    
      ...rows     
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`, // On force le début à A1
      valueInputOption: 'RAW',
      resource: { values }
    });

    console.log(`✅ Écriture terminée dans ${sheetName} (Colonnes A-G)`);

  } catch (err) {
    console.error(`❌ Erreur Google Sheets (${sheetName}) :`, err.message);
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
    console.error('❌ Erreur token NinjaOne :', err.response?.data || err.message);
    return null;
  }
}

// ----------------- NINJA -----------------
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
    console.error(`❌ Impossible de récupérer OS du device ${deviceId}:`, err.response?.data || err.message);
    return { osName: "OS inconnu", osRelease: "N/A" };
  }
};

async function getNinjaDevices() {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const resp = await axios.get(`${NINJA_URL}/v2/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const devices = resp.data;
    console.log(`🖥️ ${devices.length} devices récupérés`);

    const rows = [];

    for (const d of devices) {
      const name = d.systemName || d.hostname || d.displayName || "(nom inconnu)";
      const lastContact = formatTimestamp(d.lastContact);
  

      // OS Name et OS Release depuis le device complet
      const osInfo = await getDeviceOS(d.id, token);
      const osName = osInfo.osName;
      const osRelease = osInfo.osRelease;

      // Récupérer Agent Version depuis les champs personnalisés
      let agentVersion = "Inconnue";
      try {
        const customResp = await axios.get(`${NINJA_URL}/v2/device/${d.id}/custom-fields`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        agentVersion = customResp.data.versionAgentNinjaone || "Inconnue";
      } catch (errCustom) {
        console.warn(`⚠️ Impossible de récupérer le champ versionAgentNinjaone pour ${name} :`, errCustom.message);
      }

      console.log(`- ${name} | OS Name: ${osName} | OS Release: ${osRelease} | Agent: ${agentVersion}`);

      rows.push([d.id, name, osName, osRelease, agentVersion, lastContact]);
    }

    await writeToSheet(rows, SHEET_NAME_NINJA);
  } catch (err) {
    console.error('❌ Erreur NinjaOne :', err.response?.data || err.message);
  }
}

// ----------------- CORTEX -----------------

function windowsReleaseToHVersion(osVersion) {
  if (!osVersion) return "N/A";

  // Exemples possibles :
  // "10.0.22621" → 22H2
  // "10.0.26100" → 24H2

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
  console.log(`Début Cortex XDR ${new Date().toLocaleString('fr-FR')}`);
  let offset = 0;
  const allRows = [];

  while (true) {
    try {
      const resp = await axios.post(
        URL_CORTEX,
        {
          request_data: {
            filters: [],
            search_from: offset,
            search_to: offset + PAGE_SIZE
          }
        },
        {
          headers: {
            "x-xdr-auth-id": AUTH_ID_CORTEX,
            Authorization: AUTH_TOKEN_CORTEX,
            "Content-Type": "application/json"
          }
        }
      );

      const endpoints = resp.data.reply.endpoints || [];
      const result_count = resp.data.reply.result_count || 0;
      const total_count = resp.data.reply.total_count || 0;

      endpoints.forEach(e => {
        const osNameRaw = e.operating_system || e.os_name || "";

        const osNameUpper = osNameRaw.toUpperCase();

        // ✅ GARDER UNIQUEMENT WINDOWS
        if (!osNameUpper.includes("WINDOWS")) return;

        // ❌ EXCLURE WINDOWS SERVER / LINUX / MAC
        if (
          osNameUpper.includes("WINDOWS SERVER") ||
          osNameUpper.includes("AGENT_OS_LINUX") ||
          osNameUpper.includes("AGENT_OS_MAC")
        ) return;

        const osName = osNameRaw.replace(/Microsoft\s*/i, "").trim(); // optionnel
        const osRelease = windowsReleaseToHVersion(e.os_version);
        const lastSeen = formatTimestamp(e.last_seen,true);
      

        console.log(`${e.endpoint_name} | ${osName} | ${osRelease}`);

        allRows.push([
          e.endpoint_id || "(ID inconnu)",
          e.endpoint_name || "(Nom inconnu)",
          osName,
          osRelease,
          e.endpoint_version || "(Version agent inconnue)",
          lastSeen
        ]);
      });

      if (result_count < PAGE_SIZE || offset >= total_count) break;
      offset += PAGE_SIZE;

    } catch (err) {
      console.error('❌ Erreur Cortex XDR :', err.message);
      break;
    }
  }

  //await writeToSheet(allRows, SHEET_NAME_CORTEX);
  console.log(`Fin Cortex XDR ${new Date().toLocaleString('fr-FR')}`);
}


// ----------------- MAIN -----------------
async function main() {
  console.log(`🚀 Début exécution globale ${new Date().toLocaleString('fr-FR')}`);
  await getNinjaDevices();
  await getCortexDevices();
  console.log(`🏁 Fin exécution globale ${new Date().toLocaleString('fr-FR')}`);
}

main();
