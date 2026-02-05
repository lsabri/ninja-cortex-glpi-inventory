const axios = require('axios');
const dotenv = require('dotenv');
const https = require('https');

// --- INITIALISATION ---
process.chdir(__dirname); // S'assure que le script lit le .env du bon dossier
dotenv.config();

const GLPI_URL = process.env.GLPI_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;

// Configuration de l'agent HTTPS pour ignorer les certificats auto-signés (.lan)
const agent = new https.Agent({ rejectUnauthorized: false });

// --- MAPPING DES IDS (Validés ensemble) ---
const IDS = {
    NAME: 1,
    STATUS: 31,
    OS_NAME: 45,
    OS_VERSION: 46,  // Souvent bloqué à "2009"
    OS_BUILD: 161,   // Le numéro technique (ex: 22631)
    AGENT_UA: 5160,
    FUSINV_CONTACT: 5150 // Date de dernier contact réelle
};

// --- LOGIQUE DE CORRECTION "2009" ---
function getFriendlyVersion(build, currentVersion) {
    if (!build || build === "N/A" || build === "") {
        return currentVersion === "2009" ? "W10/11 (Build inconnu)" : currentVersion;
    }
    
    const b = String(build);
    // Mapping des Builds Windows connus
    if (b.startsWith('26100')) return '24H2 (W11)';
    if (b.startsWith('22631')) return '23H2 (W11)';
    if (b.startsWith('22621')) return '22H2 (W11)';
    if (b.startsWith('22000')) return '21H2 (W11)';
    if (b.startsWith('19045')) return '22H2 (W10)';
    if (b.startsWith('19044')) return '21H2 (W10)';
    if (b.startsWith('19043')) return '21H1 (W10)';
    if (b.startsWith('19042')) return '20H2 (W10)';


    
    return `Build ${b}`;
}

// --- FONCTIONS API ---
async function getSession() {
    try {
        const res = await axios.get(`${GLPI_URL}/initSession`, {
            headers: { 
                'App-Token': APP_TOKEN, 
                'Authorization': `user_token ${USER_TOKEN}` 
            },
            httpsAgent: agent
        });
        return res.data.session_token;
    } catch (error) {
        console.error("❌ Erreur de connexion GLPI (Vérifiez votre .env) :", error.message);
        process.exit(1);
    }
}

async function runInventory() {
    try {
        const token = await getSession();
        let allComputers = [];
        let start = 0;
        const step = 100; // On récupère par paquets de 100
        let totalCount = 1;

        console.log("🚀 Connexion réussie. Analyse de l'inventaire en cours...");

        while (start < totalCount) {
            const end = start + step - 1;
            const response = await axios.get(`${GLPI_URL}/search/Computer`, {
                params: {
                    // Filtres : Installé + Windows
                    'criteria[0][field]': IDS.STATUS,
                    'criteria[0][searchtype]': 'contains',
                    'criteria[0][value]': 'Installé',
                    'criteria[1][link]': 'AND',
                    'criteria[1][field]': IDS.OS_NAME,
                    'criteria[1][searchtype]': 'contains',
                    'criteria[1][value]': 'Windows',

                    // Affichage des colonnes
                    'forcedisplay[0]': 2, // ID
                    'forcedisplay[1]': IDS.NAME,
                    'forcedisplay[2]': IDS.OS_NAME,
                    'forcedisplay[3]': IDS.OS_VERSION,
                    'forcedisplay[4]': IDS.OS_BUILD,
                    'forcedisplay[5]': IDS.AGENT_UA,
                    'forcedisplay[6]': IDS.FUSINV_CONTACT,

                    'range': `${start}-${end}`
                },
                headers: { 'App-Token': APP_TOKEN, 'Session-Token': token },
                httpsAgent: agent
            });

            totalCount = response.data.totalcount;
            allComputers = allComputers.concat(response.data.data);
            
            console.log(`📦 Progression : ${allComputers.length} / ${totalCount}`);
            start += step;
        }

        // --- AFFICHAGE DU TABLEAU ---
        console.log("\n" + "=".repeat(155));
        console.log(
            "ID".padEnd(6) + " | " + 
            "Nom".padEnd(15) + " | " + 
            "OS Detecté".padEnd(25) + " | " + 
            "Version Réelle".padEnd(18) + " | " + 
            "Agent".padEnd(15) + " | " + 
            "Dernier Contact"
        );
        console.log("=".repeat(155));

        allComputers.forEach(c => {
            const build = String(c[IDS.OS_BUILD] || "");
            const version = String(c[IDS.OS_VERSION] || "N/A");
            const realVersion = getFriendlyVersion(build, version);
            const agentVer = String(c[IDS.AGENT_UA] || "N/A").split('/')[0].split(' ')[0];

            console.log(
                `${String(c[2]).padEnd(6)} | ` +
                `${String(c[IDS.NAME] || "N/A").padEnd(15)} | ` +
                `${String(c[IDS.OS_NAME] || "N/A").substring(0, 25).padEnd(25)} | ` + 
                `${realVersion.padEnd(18)} | ` +
                `${agentVer.padEnd(15)} | ` +
                `${String(c[IDS.FUSINV_CONTACT] || "N/A")}`
            );
        });

        console.log("=".repeat(155));
        console.log(`✅ Terminé : ${allComputers.length} machines listées.`);

    } catch (error) {
        console.error("❌ Erreur fatale :", error.response?.data || error.message);
    }
}

// Lancement du script (Mode IIFE pour gérer l'asynchrone en CommonJS)
runInventory();