require("dotenv").config();
const path = require('path');

// Validate required configurations
[
    'POSTGRES_IMAGE',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'HOST',
    'PORT',
    'NGINX_HTTP_PORT',
    'HAPI_IMAGE',
    'HAPI_SERVER_PORT',
].forEach(name => {
    if (!process.env[name]) {
        throw new Error(`Configuration error: ${name} env variable is not set`);
    }
});

const ROOT_DIR           = path.join(__dirname, '..');
const UPLOAD_LOG_FILE    = path.join(ROOT_DIR, "scripts", ".uploaded-files.json");
const DATA_SRC_DIR       = path.join(ROOT_DIR, "seed-data", "R4", "SYNTHEA");
const DATA_DIR           = path.join(ROOT_DIR, "data");
const HAPI_FHIR_BASE_URL = `https://${process.env.HOST}:${process.env.PORT}`;


module.exports = {
    ROOT_DIR,
    HAPI_FHIR_BASE_URL,
    UPLOAD_LOG_FILE,
    DATA_SRC_DIR,
    DATA_DIR
};
