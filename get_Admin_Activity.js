#!/usr/bin/env node

const axios = require('axios');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

process.chdir(__dirname);

dotenv.config();

// ================= CONFIG =================
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

const MAIL_FROM = "alertes.ninjaOne@lemonde.fr";
const MAIL_TO = "volante@lemonde.fr,presta-srahmouni@vmmagazines.com"
const MAIL_CC = "sabri@lemonde.fr";

// Dossier et fichier log
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const LOG_FILE = path.join(logDir, 'activity_Admin.log');

// ================= UTIL =================
function log(message) {
    const date = new Date().toLocaleString('fr-FR');
    const line = `[${date}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
}

function convertTimestampToDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

function sendEmail(vBody, vDateBefore, vDateAfter) {
    const transporter = nodemailer.createTransport({
        host: 'smtpout.glm.lan',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: MAIL_FROM,
        to: MAIL_TO,
        cc: MAIL_CC,
        subject: `Alertes Ninja from srvasi : filesystem exploré | cmd lancée | GPO modifiée (${vDateAfter} à ${vDateBefore})`,
        html: `<!DOCTYPE html><html><body>${vBody}</body></html>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) return log('❌ Erreur envoi mail : ' + error.message);
        log('✅ Mail envoyé : ' + info.response);
    });
}

// ================= NINJA =================
async function getAccessToken() {
    try {
        log('🔑 Récupération token Ninja…');
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
        log('✅ Token Ninja récupéré');
        return resp.data.access_token;
    } catch (err) {
        log('❌ Token KO NinjaOne : ' + (err.response?.data || err.message));
        return null;
    }
}

// ================= FONCTION PRINCIPALE =================
async function AlertesNinja() {
    try {
        const token = await getAccessToken();
        if (!token) return log('❌ Impossible de récupérer le token, arrêt du script.');

        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const intervalInSeconds = 3600 / 4; // 15 min
        const beforeTimestamp = Math.round(Date.now() / 1000);
        const afterTimestamp = beforeTimestamp - intervalInSeconds;
        const vDateBefore = convertTimestampToDate(beforeTimestamp);
        const vDateAfter = convertTimestampToDate(afterTimestamp);

        const urls = [
            { url: `/v2/activities?class=DEVICE&before=${beforeTimestamp}&after=${afterTimestamp}&type=REMOTE_TOOLS&pageSize=200`, type: 'FS' },
            { url: `/v2/activities?class=DEVICE&before=${beforeTimestamp}&after=${afterTimestamp}&type=SYSTEM&pageSize=200`, type: 'CMD' },
            { url: `/v2/activities?class=SYSTEM&before=${beforeTimestamp}&after=${afterTimestamp}&status=POLICY_UPDATED&pageSize=200`, type: 'GPO' }
        ];

        let vBody1 = '', vBody2 = '', vBody3 = '';

        for (const { url, type } of urls) {
            try {
                log(`🔹 Requête pour ${type} : ${NINJA_URL + url}`);
                const resp = await axios.get(NINJA_URL + url, { headers, timeout: 15000 });
                const activities = resp.data.activities || [];
                log(`Nombre d'activités pour ${type} : ${activities.length}`);

                let vListeActivities = '';
                activities.forEach(a => {
                    const message = a.message || '';
                    const activityTime = convertTimestampToDate(a.activityTime);
                    const resourceType = a.data?.message?.params?.resourceType;
                    const resource = a.data?.message?.params?.resource;
                    const activityResult = a.activityResult || '';
                    const additionalInfo = type === 'GPO' ? a.data?.message?.params?.policyName : resource;
                    const user = type === 'GPO' ? a.data?.message?.params?.appUserName : '';

                    if ((type === 'FS' && resourceType === 'FILE_SYSTEM') ||
                        (type === 'CMD' && resourceType === 'RTC_TERMINAL') ||
                        (type === 'GPO')) {
                        vListeActivities += `<li>${activityTime} => <u>${message}</u> (${resourceType}) => <font color='red'>${additionalInfo}</font> (${activityResult})${user ? ` => ${user}` : ''}</li>`;
                    }
                });

                if (vListeActivities) {
                    if (type === 'FS') vBody1 = "<u><b>Machines dont le filesystem a été exploré</b></u><br><ul>" + vListeActivities + "</ul><br>";
                    if (type === 'CMD') vBody2 = "<u><b>Machines où la commande cmd a été lancée</b></u><br><ul>" + vListeActivities + "</ul><br>";
                    if (type === 'GPO') vBody3 = "<u><b>Stratégies modifiées</b></u><br><ul>" + vListeActivities + "</ul><br>";
                }

            } catch (err) {
                log(`❌ Erreur activité ${type} : ${err.response?.data || err.message}`);
            }
        }

        const vBody = `Bonjour,<br><br>${vBody1}${vBody2}${vBody3}<br>Cordialement`;
        log('📩 Corps du mail généré.');

        if (vBody1 || vBody2 || vBody3) {
            sendEmail(vBody, vDateBefore, vDateAfter);
        } else {
            log('⚠️ Aucune activité détectée. Pas d’envoi de mail.');
        }

    } catch (err) {
        log('❌ Erreur globale du script : ' + err.message);
        
    }
    log('--------------------------');
}

// ================= EXEC =================
AlertesNinja();
