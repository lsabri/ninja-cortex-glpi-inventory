const axios = require('axios');
require('dotenv').config();

const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID = process.env.CLIENT_ID_NINJA;
const SECRET = process.env.AUTH_SECRET_NINJA;

const TARGET_ORG = "_COMPUTERS_News";

async function getAccessToken() {
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: SECRET,
        scope: 'monitoring'
    });
    const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, params);
    return resp.data.access_token;
}

async function getOrganizationsMap(token) {
    const { data: orgs } = await axios.get(`${NINJA_URL}/v2/organizations`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const map = {};
    orgs.forEach(o => { map[o.id] = o.name; });
    return map;
}

async function displayFilteredDevices() {
    try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };

        const orgNames = await getOrganizationsMap(token);
        const { data: devices } = await axios.get(`${NINJA_URL}/v2/devices`, { headers });
        
        console.log(`🔍 Scan pour l'organisation : ${TARGET_ORG}...`);
        console.log("-".repeat(110));
        console.log(`${"DEVICE".padEnd(20)} | ${"ORGANISATION".padEnd(20)} | ${"IP".padEnd(15)} | ${"OU - AD"}`);
        console.log("-".repeat(110));

        let count = 0;

        for (const d of devices) {
            const orgName = orgNames[d.organizationId] || "";

            // Filtre sur l'organisation
            if (orgName !== TARGET_ORG) continue;

            try {
                // Pour avoir l'IP fiable, on demande le détail complet du device
                const { data: fullDevice } = await axios.get(`${NINJA_URL}/v2/device/${d.id}`, { headers });
                
                // On récupère l'IP publique ou locale (lastIp est souvent la plus fiable ici)
                const ip = fullDevice.lastIp || (fullDevice.ipAddresses && fullDevice.ipAddresses[0]) || "N/A";

                // Récupération du champ personnalisé
                const { data: customFields } = await axios.get(`${NINJA_URL}/v2/device/${d.id}/custom-fields`, { headers });
                const ouAD = customFields["OU - AD"] || customFields.ouAd || "VIDE";

                const deviceName = fullDevice.systemName || fullDevice.hostname || "Inconnu";

                console.log(
                    `${deviceName.padEnd(20)} | ` +
                    `${orgName.substring(0, 19).padEnd(20)} | ` +
                    `${ip.padEnd(15)} | ` +
                    `${ouAD}`
                );
                count++;

            } catch (err) {
                console.error(`⚠️ Erreur détails pour device ID ${d.id}: ${err.message}`);
            }
        }

        console.log("-".repeat(110));
        console.log(`✅ Terminé : ${count} appareils trouvés.`);

    } catch (err) {
        console.error("❌ Erreur critique:", err.message);
    }
}

async function main() {
    await displayFilteredDevices();
}

main();