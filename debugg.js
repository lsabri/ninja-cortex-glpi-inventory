const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const NINJA_URL = process.env.NINJA_URL;
const CLIENT_ID_NINJA = process.env.CLIENT_ID_NINJA;
const AUTH_SECRET_NINJA = process.env.AUTH_SECRET_NINJA;


console.log(`🔍 URL ${NINJA_URL} `);
console.log(`🔍 CAUTH_SECRET_NINJA ${AUTH_SECRET_NINJA}`);
//////
