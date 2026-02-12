#!/usr/bin/env node

const axios = require('axios');
const dotenv = require('dotenv');
const { exec } = require('child_process');
dotenv.config();

const { NINJA_URL, CLIENT_ID_NINJA, AUTH_SECRET_NINJA } = process.env;
async function getAccessToken() {
    try {
        const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
            params: {
                grant_type: 'client_credentials',
                client_id: CLIENT_ID_NINJA,
                client_secret: AUTH_SECRET_NINJA,
                scope: 'monitoring management control' 
            }
        });
        return resp.data.access_token;
    } catch (err) {
        console.error('❌ Erreur Auth :', err.response?.data || err.message);
        return null;
    }
}

async function launchRemoteSession(deviceId) {
    const token = await getAccessToken();
    if (!token) return;

    // L'endpoint officiel V2 est souvent celui-ci (sans le mot "session")
    const url = `${NINJA_URL}/v2/device/${deviceId}/remote-control-url`;
    
    console.log(`📡 Initialisation de la connexion pour le device ${deviceId}...`);
    console.log(`💡 Note : Ninja peut prendre quelques secondes pour préparer le tunnel.`);

    // On tente 3 fois avec un délai car tu as remarqué une attente dans l'UI
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const resp = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { tool: 'NINJA_REMOTE' } // On force l'outil Ninja Remote
            });

            if (resp.data && resp.data.url) {
                console.log(`✅ Session prête ! Lancement...`);
                const cmd = process.platform === 'win32' ? 'start' : 'open';
                exec(`${cmd} "${resp.data.url}"`);
                return;
            }
        } catch (err) {
            if (err.response?.status === 404) {
                console.log(`⏳ Tentative ${attempt}/3 : Le service n'est pas encore prêt (404)...`);
            } else {
                console.log(`❌ Erreur ${err.response?.status} : ${err.response?.data?.errorMessage || err.message}`);
            }
            
            // Attendre 3 secondes avant la prochaine tentative
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.error(`\n💀 Échec : Impossible de générer le lien après 3 tentatives.`);
    console.log(`👉 Vérification : Dans ton interface Ninja, clique sur le device ${deviceId}.`);
    console.log(`   Si tu vois un message "Initialisation" ou "Mise à jour des permissions", c'est que le Mac bloque l'accès API.`);
}
////
const targetId = process.argv[2];
if (!targetId) {
    console.log("Usage: node script.js [ID_DEVICE]");
} else {
    launchRemoteSession(targetId);
}