const axios = require('axios');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const path = require('path');
const os = require('os');
const https = require('https');

process.chdir(__dirname);
dotenv.config();

// ----------------- CONFIG -----------------
const GLPI_URL = process.env.GLPI_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_GLPI_TEMPO = process.env.SHEET_NAME_GLPI_TEMPO;
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

let CREDENTIALS_PATH = CREDENTIALS_PATH_ENV.startsWith('~') 
  ? path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1)) 
  : CREDENTIALS_PATH_ENV;

const agentGLPI = new https.Agent({ rejectUnauthorized: false });

const GLPI_FIELDS = {
    ID: 2,
    NAME: 1,
    LOGIN_AD: 70,
    SERVICE: 76666,
    STATUS: 31
};

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "100", 10);

// ----------------- GOOGLE SHEETS -----------------
async function writeToSheet(dataRows) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Préparation des données (Headers + Lignes)
        const values = [
            ["ID", "Name Device", "LoginAD", "Service", "Status"],
            ...dataRows.map(d => [d.ID, d['Name Device'], d.LoginAD, d.Service, d.Status])
        ];

        // Nettoyage de la feuille avant écriture
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_GLPI_TEMPO}!A1:E`,
        });

        // Écriture des nouvelles données
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_GLPI_TEMPO}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values },
        });

        console.log(`✅ ${dataRows.length} lignes exportées vers Google Sheets (${SHEET_NAME_GLPI_TEMPO})`);
    } catch (err) {
        console.error(`❌ Erreur Google Sheets : ${err.message}`);
    }
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
    console.log(`[${new Date().toLocaleString()}] 📦 Extraction GLPI...`);
    let token;
    try {
        token = await getGlpiSession();
        let allDevices = [];
        let start = 0;
        let totalCount = 1;

        while (start < totalCount) {
            const response = await axios.get(`${GLPI_URL}/search/Computer`, {
                params: {
                    'criteria[0][field]': GLPI_FIELDS.STATUS, 
                    'criteria[0][searchtype]': 'contains', 
                    'criteria[0][value]': 'Installé',
                    'forcedisplay[0]': GLPI_FIELDS.ID,
                    'forcedisplay[1]': GLPI_FIELDS.NAME,
                    'forcedisplay[2]': GLPI_FIELDS.LOGIN_AD,
                    'forcedisplay[3]': GLPI_FIELDS.SERVICE,
                    'forcedisplay[4]': GLPI_FIELDS.STATUS,
                    'range': `${start}-${start + PAGE_SIZE - 1}`
                },
                headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                httpsAgent: agentGLPI
            });

            totalCount = response.data.totalcount;
            const data = response.data.data;

            if (data && Array.isArray(data)) {
                data.forEach(c => {
                    allDevices.push({
                        'ID': c[GLPI_FIELDS.ID],
                        'Name Device': c[GLPI_FIELDS.NAME],
                        'LoginAD': c[GLPI_FIELDS.LOGIN_AD] || "N/A",
                        'Service': c[GLPI_FIELDS.SERVICE] || "N/A",
                        'Status': c[GLPI_FIELDS.STATUS] || "N/A"
                    });
                });
            }
            start += PAGE_SIZE;
        }

        if (allDevices.length > 0) {
            console.table(allDevices);
            await writeToSheet(allDevices);
        } else {
            console.log("⚠️ Aucun device trouvé.");
        }

    } catch (err) {
        console.error(`❌ Erreur : ${err.message}`);
    } finally {
        if (token) {
            await axios.get(`${GLPI_URL}/killSession`, { 
                headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                httpsAgent: agentGLPI 
            }).catch(() => {});
        }
    }
}

// ----------------- RUN -----------------
getGlpiDevices();