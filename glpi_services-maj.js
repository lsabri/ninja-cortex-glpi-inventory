const axios = require('axios');
const https = require('https');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');
const os = require('os');

dotenv.config();

// ----------------- CONFIG -----------------
const GLPI_URL = process.env.GLPI_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME_MAJ = "ServicesMAJ"; 
const CREDENTIALS_PATH_ENV = process.env.CREDENTIALS_PATH;

let CREDENTIALS_PATH = CREDENTIALS_PATH_ENV.startsWith('~') 
  ? path.join(os.homedir(), CREDENTIALS_PATH_ENV.slice(1)) 
  : CREDENTIALS_PATH_ENV;

const agentGLPI = new https.Agent({ rejectUnauthorized: false });
const ITEMTYPE_SERVICE = 'PluginFieldsServicefielddropdown';

// ----------------- FONCTIONS -----------------

async function getServicesFromSheet() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_MAJ}!A2:D`, 
        });

        return response.data.values || [];
    } catch (err) {
        console.error(`❌ Erreur lecture Google Sheets : ${err.message}`);
        return [];
    }
}

async function getGlpiSession() {
    const res = await axios.get(`${GLPI_URL}/initSession`, {
        headers: { 'App-Token': APP_TOKEN, 'Authorization': `user_token ${USER_TOKEN}` },
        httpsAgent: agentGLPI
    });
    return res.data.session_token;
}

async function testUpdateSingleService(targetId) {
    const rows = await getServicesFromSheet();
    let token;
    try {
        token = await getGlpiSession();
        console.log(`🔓 Session GLPI ouverte.\n`);

        let found = false;
        for (const row of rows) {
            const id = row[0];
            const oldHierarchy = row[2]; // Colonne C
            const newName = row[3];      // Colonne D

            if (id == targetId) {
                found = true;
                
                // Format de LOG demandé : traitement ID:x: Ancien Libellé ==> nouveau libele
                console.log(`traitement ID:${id}: ${oldHierarchy} ==> ${newName}`);

                try {
                    await axios.put(`${GLPI_URL}/${ITEMTYPE_SERVICE}/${id}`, {
                        input: {
                            id: id,
                            name: newName,
                            plugin_fields_servicefielddropdowns_id: 0 
                        }
                    }, {
                        headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                        httpsAgent: agentGLPI
                    });
                    console.log(`✅ Mise à jour réussie pour l'ID ${id}`);
                } catch (err) {
                    const errorMsg = err.response && err.response.data && err.response.data[1] 
                                     ? err.response.data[1] 
                                     : err.message;
                    console.error(`❌ Erreur sur l'ID ${id} : ${errorMsg}`);
                }
                break; 
            }
        }

        if (!found) {
            console.log(`⚠️ L'ID ${targetId} est introuvable dans la feuille.`);
        }

    } catch (err) {
        console.error(`❌ Erreur session : ${err.message}`);
    } finally {
        if (token) {
            await axios.get(`${GLPI_URL}/killSession`, { 
                headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                httpsAgent: agentGLPI 
            }).catch(() => {});
        }
    }
}

// Lancement du test sur l'ID 15
testUpdateSingleService("15");