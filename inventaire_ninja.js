const axios = require('axios');
const dotenv = require("dotenv");
const { google } = require('googleapis');

dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID = process.env.CLIENT_ID_NINJA;
const CLIENT_SECRET = process.env.AUTH_SECRET_NINJA;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME_NINJA;
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;

// ----------------- UTIL -----------------
function formatTimestamp(ms) {
  if (!ms) return "N/A";
  return new Date(ms * 1000).toLocaleString('fr-FR');
}

// ----------------- GOOGLE SHEETS -----------------
async function writeToSheet(rows) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME
    });

    const updateLine = [`Dernière mise à jour : ${new Date().toLocaleString('fr-FR')}`];
    const headers = ['ID', 'Nom', 'Operating System', 'Agent Version', 'LastContact', 'LastUpdate'];
    const values = [updateLine, headers, ...rows];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
      valueInputOption: 'RAW',
      resource: { values }
    });

    console.log('✅ Écriture terminée dans Google Sheets');
  } catch (err) {
    console.error('❌ Erreur lors de l’écriture dans Google Sheets :', err.message, err.errors || '');
  }
}

// ----------------- TOKEN NINJA -----------------
async function getAccessToken() {
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'monitoring management control'
    });

    const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return resp.data.access_token;
  } catch (err) {
    console.error('❌ Token KO :', err.response?.data || err.message);
    return null;
  }
}

// ----------------- RÉCUPÉRATION DÉTAILLÉE PAR DEVICE -----------------
async function getDeviceDetails(deviceId, headers) {
  try {
    const resp = await axios.get(`${NINJA_URL}/v2/device/${deviceId}`, { headers });
    const device = resp.data;

    const os = device.os
      ? `${device.os.name} | ${device.os.releaseId || 'N/A'}`
      : "OS inconnu";

    const agentVersion = device.system?.agentVersion || "Inconnue";

    return {
      id: device.id,
      name: device.systemName || device.hostname || device.displayName || "(nom inconnu)",
      os,
      agentVersion,
      lastContact: formatTimestamp(device.lastContact),
      lastUpdate: formatTimestamp(device.lastUpdate)
    };
  } catch (err) {
    console.error(`❌ Impossible de récupérer le device ${deviceId}:`, err.response?.data || err.message);
    return null;
  }
}

// ----------------- RÉCUPÉRATION DE TOUS LES DEVICES -----------------
async function getAllDevices() {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  try {
    const response = await axios.get(`${NINJA_URL}/v2/devices`, { headers });
    const devices = response.data;

    console.log(`🖥️ ${devices.length} devices récupérés :`);

    const rows = [];

    for (const device of devices) {
      const details = await getDeviceDetails(device.id, headers);
      if (details) {
        console.log(`- ID: ${details.id} | Nom: ${details.name} | OS: ${details.os} | Agent: ${details.agentVersion}`);
        rows.push([details.id, details.name, details.os, details.agentVersion, details.lastContact, details.lastUpdate]);
      }
    }

    await writeToSheet(rows);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des devices :', err.response?.data || err.message);
  }
}

// ----------------- MAIN -----------------
async function main() {
  console.log(`Début exécution le ${new Date().toLocaleString('fr-FR')}`);
  await getAllDevices();
  console.log(`Fin exécution le ${new Date().toLocaleString('fr-FR')}`);
}

main();
