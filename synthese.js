const { google } = require('googleapis');
const dotenv = require('dotenv');
const fs = require('fs');
const os = require('os');
const path = require('path');

dotenv.config();

// ----------------- CONFIG -----------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_NINJA = process.env.SHEET_NAME_NINJA;
const SHEET_NAME_CORTEX = process.env.SHEET_NAME_CORTEX;
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

// Si le chemin commence par ~, on le remplace par le home
if (CREDENTIALS_PATH_ENV.startsWith('~')) {
  CREDENTIALS_PATH = path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1));
}


// ----------------- AUTH GOOGLE SHEETS -----------------
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ----------------- READ DATA -----------------
async function readSheet(sheetName, sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A3:F`, // Range complet, nom en B, date en F
  });

  const values = res.data.values || [];
  // Retourner un tableau d'objets { name, last }
  return values.map(row => ({
    name: row[1],             // colonne B
    last: row[5] || '',     // colonne F
  })).filter(item => item.name); // ignorer lignes sans nom
}

// ----------------- COMPARE -----------------
async function writeCompareSheet(ninjaData, cortexData, sheets) {
  const ninjaMap = new Map(ninjaData.map(item => [item.name, item.last]));
  const cortexMap = new Map(cortexData.map(item => [item.name, item.last]));

  const allNames = new Set([...ninjaMap.keys(), ...cortexMap.keys()]);
  const compareRows = [];

  allNames.forEach(name => {
    const inNinja = ninjaMap.has(name) ? 'Oui' : 'Non';
    const lastContact = ninjaMap.get(name) || '';
    const inCortex = cortexMap.has(name) ? 'Oui' : 'Non';
    const lastSeen = cortexMap.get(name) || '';

    compareRows.push([name, inNinja, lastContact, inCortex, lastSeen]);
  });

  compareRows.sort((a, b) => a[0].localeCompare(b[0]));

  // Créer ou vider la feuille COMPARE
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'COMPARE',
    });
  } catch (err) {
    // si la feuille n'existe pas, on la crée
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          addSheet: { properties: { title: 'COMPARE' } }
        }]
      }
    });
  }

  // Écrire les en-têtes
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `COMPARE!A1:E1`,
    valueInputOption: 'RAW',
    resource: { values: [['Nom', 'Machine dans Ninja', 'Last Contact', 'Machine dans Cortex', 'Last Seen']] }
  });

  if (compareRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `COMPARE!A2`,
      valueInputOption: 'RAW',
      resource: { values: compareRows }
    });
  }
}

// ----------------- MAIN -----------------
async function main() {
  const sheets = await getSheetsClient();

  const [ninjaData, cortexData] = await Promise.all([
    readSheet(SHEET_NAME_NINJA, sheets),
    readSheet(SHEET_NAME_CORTEX, sheets)
  ]);

  await writeCompareSheet(ninjaData, cortexData, sheets);

  console.log('✅ Feuille COMPARE générée avec succès');
}

main().catch(err => console.error(err));
