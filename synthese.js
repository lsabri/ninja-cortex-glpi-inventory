#!/usr/bin/env node

const dotenv = require('dotenv');
const { google } = require('googleapis');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Configuration de l'environnement
process.chdir(__dirname);
dotenv.config();

// ----------------- CONFIG -----------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_NINJA = process.env.SHEET_NAME_NINJA;
const SHEET_NAME_CORTEX = process.env.SHEET_NAME_CORTEX;
const SHEET_NAME_COMPARE = 'COMPARE';
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

let CREDENTIALS_PATH = CREDENTIALS_PATH_ENV.startsWith('~') 
  ? path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1)) 
  : CREDENTIALS_PATH_ENV;

// ----------------- LOGS -----------------
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const LOG_FILE = path.join(logDir, 'buildCompareSheet.log');

function log(message) {
  const date = new Date().toLocaleString('fr-FR');
  const line = `[${date}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

// ----------------- FONCTION PRINCIPALE -----------------
async function buildCompareSheet() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    log("📊 Lecture des données Ninja et Cortex...");

    // 1. Récupération des données en parallèle
    const [ninjaRes, cortexRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET_NAME_NINJA
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET_NAME_CORTEX
      })
    ]);

    const ninjaRows = ninjaRes.data.values || [];
    const cortexRows = cortexRes.data.values || [];

    const ninjaMap = new Map();
    const cortexMap = new Map();

    // 2. Mapping Ninja (Nom en B [index 1], Last Contact en F [index 5])
    // On commence à i=1 pour sauter l'entête
    for (let i = 1; i < ninjaRows.length; i++) {
      const rawName = ninjaRows[i][1];
      if (rawName && rawName.trim() !== "") {
        const cleanName = rawName.trim();
        const key = cleanName.toUpperCase(); // Clé de comparaison unique
        ninjaMap.set(key, {
            name: cleanName,
            lastContact: ninjaRows[i][5] || 'N/C'
        });
      }
    }

    // 3. Mapping Cortex (Nom en B [index 1], Last Seen en F [index 5])
    for (let i = 1; i < cortexRows.length; i++) {
      const rawName = cortexRows[i][1];
      if (rawName && rawName.trim() !== "") {
        const cleanName = rawName.trim();
        const key = cleanName.toUpperCase(); // Clé de comparaison unique
        cortexMap.set(key, {
            name: cleanName,
            lastSeen: cortexRows[i][5] || 'N/C'
        });
      }
    }

    // 4. Construction du tableau de comparaison
    // On fusionne toutes les clés uniques des deux maps
    const allKeys = new Set([...ninjaMap.keys(), ...cortexMap.keys()]);
    
    const compareRows = [
      ['Nom device', 'Dans Ninja?', 'Last Contact (Ninja)', 'Dans Cortex?', 'Last Seen (Cortex)']
    ];

    // Trier les clés par ordre alphabétique
    const sortedKeys = Array.from(allKeys).sort();

    for (const key of sortedKeys) {
      const nData = ninjaMap.get(key);
      const cData = cortexMap.get(key);

      compareRows.push([
        nData?.name || cData?.name || key, // Priorité au nom formatté de Ninja, sinon Cortex
        nData ? 'OUI' : 'NON',
        nData ? nData.lastContact : '',
        cData ? 'OUI' : 'NON',
        cData ? cData.lastSeen : ''
      ]);
    }

    // 5. Nettoyage de la feuille COMPARE avant écriture
    log(`🧹 Nettoyage de la feuille ${SHEET_NAME_COMPARE}...`);
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME_COMPARE
    });

    // 6. Écriture groupée (BatchUpdate)
    const lastUpdate = `Dernière synchronisation : ${new Date().toLocaleString('fr-FR')}`;

    log("📝 Écriture des nouvelles données...");
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${SHEET_NAME_COMPARE}!A1`,
            values: [[lastUpdate]] // Info de date en A1
          },
          {
            range: `${SHEET_NAME_COMPARE}!A2`,
            values: compareRows // En-têtes en A2 et données en dessous
          }
        ]
      }
    });

    log(`✅ Succès : ${compareRows.length - 1} devices traités.`);

  } catch (err) {
    log(`❌ Erreur fatale : ${err.message}`);
    if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
  }
}

// ----------------- EXÉCUTION -----------------
(async function main() {
  log(`🚀 Démarrage du script de comparaison`);
  await buildCompareSheet();
  log(`🏁 Fin du script`);
})();