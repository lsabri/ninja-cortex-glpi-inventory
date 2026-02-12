#!/usr/bin/env node

/**
 * Version “light” pour utilisateur
 * Ouvre le device 2171 et masque les menus
 */

const puppeteer = require('puppeteer');
require('dotenv').config();

const { NINJA_URL } = process.env;

if (!NINJA_URL) {
  console.error("❌ Vérifie que NINJA_URL est défini dans .env");
  process.exit(1);
}

const DEVICE_ID = "2171";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Ouvrir le device
  const deviceUrl = `${NINJA_URL.replace(/\/$/, '')}/#/deviceDashboard/${DEVICE_ID}/overview`;
  await page.goto(deviceUrl, { waitUntil: 'networkidle2' });

  console.log(`[${new Date().toLocaleTimeString()}] 🌐 Dashboard ouvert`);

  // Injecter CSS pour masquer tout sauf Remote
  const customCSS = `
    /* Masquer sidebar */
    .sidebar, .navbar, .header, .footer, .top-bar, .menu { display: none !important; }
    /* Masquer tous les autres panels sauf Remote */
    .device-overview-panel > *:not([aria-label="Remote"]) { display: none !important; }
    body { overflow: hidden !important; }
  `;
  await page.addStyleTag({ content: customCSS });

  console.log("✅ Interface simplifiée : seul le bouton Remote est visible");
  console.log("ℹ️ L'utilisateur doit se connecter s'il n'est pas déjà loggué, puis cliquer sur Remote");

  // Laisser le navigateur ouvert pour l'utilisateur
})();
