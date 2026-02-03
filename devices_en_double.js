const axios = require('axios');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
dotenv.config();

// ----------------- CONFIG -----------------
const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;

const MAIL_FROM = process.env.MAIL_FROM || 'alertes.ninjaOne@lemonde.fr';
const MAIL_TO = process.env.MAIL_TO || 'lemarchand@lemonde.fr,nguyen@lemonde.fr,presta-aodzayibo@vmmagazines.com,presta-srahmouni@vmmagazines.com';
const MAIL_CC = process.env.MAIL_CC || 'sabri@lemonde.fr,volante@lemonde.fr';

// ----------------- UTIL -----------------
function sendEmail(vBody) {
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
    subject: `Alertes Ninja : Liste des devices en doublons`,
    html: `<!DOCTYPE html><html><body>${vBody}</body></html>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return console.error('❌ Erreur envoi mail :', error.message);
    console.log('✅ Mail envoyé :', info.response);
  });
}

async function getAccessToken() {
  try {
    const resp = await axios.post(`${NINJA_URL}/ws/oauth/token`, null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID_NINJA,
        client_secret: AUTH_SECRET_NINJA,
        scope: 'monitoring'
      }
    });
    console.log('✅ Token Ninja récupéré');
    return resp.data.access_token;
  } catch (err) {
    console.error('❌ Erreur token NinjaOne :', err.response?.data || err.message);
    return null;
  }
}

async function getDevices(accessToken) {
  const url_liste = `/v2/devices-detailed`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  try {
    const resp = await axios.get(NINJA_URL + url_liste, { headers });
    const devices = resp.data.map(d => ({
      id: d.id,
      systemName: d.systemName,
      sn: d.system?.serialNumber
    }));
    // Exclure certains IDs si nécessaire
    return devices.filter(d => d.id !== 25 && d.id !== 26);
  } catch (err) {
    console.error('❌ Erreur récupération devices :', err.message);
    return [];
  }
}

// ----------------- MAIN -----------------
async function main() {
  try {
    const token = await getAccessToken();
    if (!token) return console.error('Impossible de récupérer le token, arrêt du script.');

    const devicesList = await getDevices(token);
    if (devicesList.length === 0) return console.log('⚠️ Pas de devices récupérés.');

    // Trier par SN (sécurisé)
    devicesList.sort((a, b) => {
      const snA = a.sn || '';
      const snB = b.sn || '';
      return snA.localeCompare(snB);
    });

    // Chercher les doublons
    const doublons = [];
    const aSupprimer = [];
    const seenSN = {};

    for (let i = 0; i < devicesList.length - 1; i++) {
      const current = devicesList[i];
      const next = devicesList[i + 1];

      if (current.sn && current.sn === next.sn) {
        if (!seenSN[current.sn]) {
          doublons.push({ id: current.id, systemName: current.systemName, sn: current.sn });
          seenSN[current.sn] = true;
        }
        doublons.push({ id: next.id, systemName: next.systemName, sn: next.sn });

        if (current.id < next.id) aSupprimer.push({ id: current.id, systemName: current.systemName, sn: current.sn });
        else aSupprimer.push({ id: next.id, systemName: next.systemName, sn: next.sn });
      }
    }

    // --- Préparer corps du mail ---
    let vBody = '';
    if (doublons.length > 0) {
      const chDoublons = doublons.map(d => `<li>${d.id} => ${d.systemName} => <b><font color='blue'>${d.sn}</font></b></li>`).join('');
      const chAsupprimer = aSupprimer.map(d => `<li><font color='red'><b>${d.id}</b></font> => ${d.systemName} => ${d.sn}</li>`).join('');

      vBody = `Bonjour,<br>Voici la liste des devices actuellement en doublons dans la base Ninja : <b>[ID => SystemName => SN]</b><br><ul>${chDoublons}</ul>`;
      vBody += `Voici la liste des devices à supprimer : <b>[ID => SystemName => SN]</b><br><ul>${chAsupprimer}</ul>`;

      console.log('📩 Corps du mail :\n', vBody); // debug
      sendEmail(vBody);
    } else {
      console.log('✅ Pas de doublons trouvés. Envoi d’un mail test.');
      vBody = "<b>Aucun doublon détecté sur NinjaOne.</b>";
      sendEmail(vBody);
    }

  } catch (err) {
    console.error('❌ Erreur globale :', err.message);
  }
}

// ----------------- EXECUTION -----------------
main();
