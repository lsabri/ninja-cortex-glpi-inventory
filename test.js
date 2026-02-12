#!/usr/bin/env node

/**
 * Ouvre directement l’UI Ninja sur le dashboard du device
 * Paramètre : device ID
 */

const { exec } = require('child_process');
const dotenv = require('dotenv');

dotenv.config();

// ---------------- ENV ----------------
const { NINJA_URL } = process.env;

if (!NINJA_URL) {
  console.error("❌ Vérifie que NINJA_URL est défini dans ton .env");
  process.exit(1);
}

// ---------------- LOG ----------------
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// ---------------- MAIN ----------------
function openDeviceUI(deviceId) {
  log(`🚀 Ouverture de l’UI Ninja pour device ID "${deviceId}"...`);

  // Construire l’URL complète
  const url = `${NINJA_URL.replace(/\/$/, '')}/#/deviceDashboard/${deviceId}/overview`;

  log(`🌐 URL : ${url}`);

  // Commande pour ouvrir le navigateur selon l’OS
  const cmd =
    process.platform === 'win32'
      ? 'start'
      : process.platform === 'darwin'
      ? 'open'
      : 'xdg-open';

  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      console.error("❌ Impossible d’ouvrir le navigateur :", err.message);
    } else {
      log("✅ Navigateur lancé avec succès !");
    }
  });
}

// ---------------- EXEC ----------------
const deviceId = process.argv[2];

if (!deviceId) {
  console.log("Usage: node ninja-ui.js [DEVICE_ID]");
} else {
  openDeviceUI(deviceId);
}
