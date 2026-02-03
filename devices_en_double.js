#!/usr/bin/env node

const axios = require('axios');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const fs = require('fs');

const path = require('path');
process.chdir(__dirname);
dotenv.config();

// ================= CONFIG =================
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const LOG_FILE = path.join(logDir, 'devices_en_double.log');

const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

// ================= UTIL =================
function log(message) {
    const date = new Date().toLocaleString('fr-FR');
    const line = `[${date}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
}

// ================= MAIL =================
function sendEmail(vBody) {
    const transporter = nodemailer.createTransport({
        host: 'smtpout.glm.lan',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: 'alertes.ninjaOne@lemonde.fr',
        to: 'lemarchand@lemonde.fr,nguyen@lemonde.fr',
        cc: 'sabri@lemonde.fr,volante@lemonde.fr',
        subject: `Alertes Ninja from srvasi: Devices en doublons`,
        html: vBody
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            log('❌ Erreur mail: ' + error.message);
        } else {
            log('✅ Email envoyé: ' + info.response);
        }
    });
}

// ================= NINJA =================
async function getAccessToken() {
    try {
        log('Récupération token Ninja…');
        const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            params: {
                grant_type: 'client_credentials',
                client_id: CLIENT_ID_NINJA,
                client_secret: AUTH_SECRET_NINJA,
                scope: 'monitoring'
            },
            timeout: 10000
        });
        log('✅ Token récupéré');
        return resp.data.access_token;
    } catch (err) {
        log('❌ Erreur token NinjaOne: ' + (err.response?.data || err.message));
        return null;
    }
}

async function getDevices(accessToken) {
    try {
        const resp = await axios.get(`${NINJA_URL}/v2/devices-detailed`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });

        const devices = resp.data.map(node => ({
            id: node.id,
            systemName: node.systemName,
            sn: node.system?.serialNumber
        }));

        // Exclure devices sans SN et certains IDs
        return devices.filter(d => d.sn && d.id !== 25 && d.id !== 26);
    } catch (err) {
        log('❌ Erreur récupération devices: ' + err.message);
        return [];
    }
}

// ================= MAIN =================
async function main() {
    log('Script lancé');

    const token = await getAccessToken();
    if (!token) return log('Impossible de récupérer le token, arrêt du script.');

    const devices = await getDevices(token);
    if (!devices.length) return log('Aucun device récupéré.');

    // Trier par SN
    devices.sort((a, b) => a.sn.localeCompare(b.sn));

    // Chercher les doublons
    const doublons = [];
    const aSupprimer = [];
    const seen = {};

    for (let i = 0; i < devices.length - 1; i++) {
        const curr = devices[i];
        const next = devices[i + 1];

        if (curr.sn === next.sn) {
            // Ajouter une seule fois le premier device pour ce SN
            if (!seen[curr.sn]) {
                doublons.push(curr);
                seen[curr.sn] = true;
            }
            doublons.push(next);

            // Décider lequel supprimer (l’ID le plus petit)
            aSupprimer.push(curr.id < next.id ? curr : next);
        }
    }

    if (doublons.length) {
        const body = `
            Bonjour,<br>
            Voici les devices en doublons:<br>
            <ul>${doublons.map(d => `<li>${d.id} => ${d.systemName} => <b>${d.sn}</b></li>`).join('')}</ul>
            Devices à supprimer:<br>
            <ul>${aSupprimer.map(d => `<li>${d.id} => ${d.systemName} => ${d.sn}</li>`).join('')}</ul>
        `;
        sendEmail(body);
    } else {
        log('Pas de doublons trouvés');
    }

    log('Script terminé\n');
      log(' ------------------ ');
}

// ================= EXEC =================
main();
