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
        //to: 'sabri@lemonde.fr',
        to: 'lemarchand@lemonde.fr,presta-aodzayibo@vmmagazines.com',
        cc: 'sabri@lemonde.fr,volante@lemonde.fr,nguyen@lemonde.fr',
        subject: `Alertes Ninja from srvasi: Devices en doublons dans Ninja`,
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
async function mainOLD() {
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

//
// ================= MAIN =================
async function main() {
    log('Script lancé');

    const token = await getAccessToken();
    if (!token) return log('Impossible de récupérer le token, arrêt du script.');

    const devices = await getDevices(token);
    if (!devices.length) return log('Aucun device récupéré.');

    // 1. Regrouper les devices par Serial Number
    const groups = {};
    devices.forEach(d => {
        if (!groups[d.sn]) {
            groups[d.sn] = [];
        }
        groups[d.sn].push(d);
    });

    const doublons = [];
    const aSupprimer = [];

    // 2. Analyser chaque groupe
    for (const sn in groups) {
        const group = groups[sn];

        if (group.length > 1) {
            // On a des doublons pour ce SN
            log(`Doublons trouvés pour SN: ${sn} (${group.length} instances)`);
            
            // Ajouter tous les membres du groupe à la liste d'affichage
            doublons.push(...group);

            // Trier le groupe par ID (croissant)
            // On garde le plus grand ID (le plus récent a priori) et on propose de supprimer les autres
            group.sort((a, b) => a.id - b.id);
            
            // Tout sauf le dernier élément du groupe trié va dans "aSupprimer"
            const toDelete = group.slice(0, group.length - 1);
            aSupprimer.push(...toDelete);
        }
    }

    // 3. Envoi du mail si nécessaire
    if (doublons.length) {
        const body = `
            Bonjour,<br><br>
            Voici les devices détectés en doublons (même numéro de série):<br>
            <table border="1" style="border-collapse: collapse; width: 100%;">
                <tr style="background-color: #f2f2f2;">
                    <th style="padding: 8px;">ID</th><th>Nom Système</th><th>Serial Number</th>
                </tr>
                ${doublons.map(d => `<tr><td style="padding: 8px;">${d.id}</td><td>${d.systemName}</td><td><b>${d.sn}</b></td></tr>`).join('')}
            </table>
            <br>
            <b>🚨 Devices suggérés à la suppression (ID les plus anciens) :</b><br>
            <ul>
                ${aSupprimer.map(d => `<li>ID: <b>${d.id}</b> | Nom: ${d.systemName} | SN: ${d.sn}</li>`).join('')}
            </ul>
        `;
        sendEmail(body);
        log(`Analyse terminée : ${doublons.length} doublons listés, ${aSupprimer.length} à supprimer.`);
    } else {
        log('Pas de doublons trouvés');
    }

    log('Script terminé\n');
    log(' ------------------ ');
}
// ================= EXEC =================
main();
