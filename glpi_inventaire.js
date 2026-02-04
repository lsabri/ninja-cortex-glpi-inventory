#!/usr/bin/env node

const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
process.chdir(__dirname);
dotenv.config();

// ================= CONFIG =================
const GLPI_URL = process.env.GLPI_URL;           // ex: https://glpi.local/apirest.php
const APP_TOKEN = process.env.GLPI_APP_TOKEN;   // jeton API / App Token
const USER_TOKEN = process.env.GLPI_USER_TOKEN; // jeton personnel / User Token



// Debug des variables d'environnement
console.log('--- DEBUG ENV VARS ---');
console.log(`GLPI_URL:        ${GLPI_URL || '❌ NON DÉFINI'}`);
console.log(`GLPI_APP_TOKEN:  ${APP_TOKEN ? APP_TOKEN.substring(0, 5) + '...' : '❌ NON DÉFINI'}`);
console.log(`GLPI_USER_TOKEN: ${USER_TOKEN ? USER_TOKEN.substring(0, 5) + '...' : '❌ NON DÉFINI'}`);
console.log('----------------------\n');

if (!GLPI_URL || !APP_TOKEN || !USER_TOKEN) {
    console.error('ERREUR : Des variables sont manquantes dans le fichier .env');
    process.exit(1);
}

// ================= HTTPS AGENT =================
const agent = new https.Agent({ rejectUnauthorized: false }); // pour certificats auto-signés

// ================= API AXIOS =================
const api = axios.create({
    baseURL: GLPI_URL,
    headers: {
        'App-Token': APP_TOKEN,
        'Authorization': `user_token ${USER_TOKEN}`,
        'Content-Type': 'application/json'
    },
    httpsAgent: agent,
    timeout: 10000
});

// ================= UTIL =================
function log(msg) {
    const date = new Date().toLocaleString('fr-FR');
    console.log(`[${date}] ${msg}`);
}

// ================= SCRIPT SIMPLE =================
async function main() {
    try {
        // 1️⃣ Ouvrir la session
        const initResp = await api.post('/initSession', {});
        const sessionToken = initResp.data.session_token;
        log('✅ Session ouverte GLPI');

        // 2️⃣ Récupérer la liste des ordinateurs
        const resp = await api.get('/Computer', {
            headers: { 'Session-Token': sessionToken }
        });

        const computers = resp.data;
        log(`Nombre d'ordinateurs récupérés : ${computers.length}`);

        computers.forEach(c => {
            console.log(`${c.id} - ${c.name || 'N/A'} - ${c.serial || 'SN inconnu'}`);
        });

        // 3️⃣ Fermer la session
        await api.post('/killSession', {}, {
            headers: { 'Session-Token': sessionToken }
        });
        log('✅ Session fermée GLPI');
        
    } catch (err) {
        log('❌ Erreur API GLPI: ' + (err.response?.data || err.message));
    }
}

// ================= EXEC =================
main();
