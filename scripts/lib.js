const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');
const {
    HAPI_FHIR_BASE_URL,
    UPLOAD_LOG_FILE,
} = require('./config');


/**
 * Clear the upload tracking log
 */
function clearUploadLog() {
    if (fs.existsSync(UPLOAD_LOG_FILE)) {
        fs.unlinkSync(UPLOAD_LOG_FILE);
        console.log("✓ Cleared upload tracking log");
    }
}

/**
 * Run a shell command
 * @param {string} cmd
 */
function run(cmd) {
    console.log(`  $ ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

/**
 * Wait for the HAPI FHIR server to start
 */
async function waitForHapi() {
    console.log("Waiting for HAPI to start...");

    const MAX_RETRIES = 30; // Maximum number of retries
    const RETRY_DELAY = 5000; // Delay between retries in milliseconds
    const HAPI_URL    = `${HAPI_FHIR_BASE_URL}/metadata`;

    let failed = true;

    for (let attempt = 1; attempt <= MAX_RETRIES && failed; attempt++) {
        try {
            await fetch(HAPI_URL)
            .then(res => {
                if (!res.status || res.status !== 200) {
                    throw new Error(`Server responded with status: ${res.status} ${res.statusText}`);
                }
                console.log("✓ HAPI is up and running!");
                failed = false
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.log(`   - Attempt ${attempt}/${MAX_RETRIES} failed: ${errorMessage}`);
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                console.error("❌ HAPI did not start within the expected time.");
                throw err;
            }
        }
    }
}

/**
 * Check if HAPI is currently running
 * @returns
 */
function hapiIsRunning() {
    try {
        const result = execSync("docker compose ps --status running --format '{{.Name}}' hapi-fhir", { 
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8'
        });
        return result.trim().length > 0;
    } catch {
        // Container not running or doesn't exist
        return false;
    }
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms)); 
}

/**
 * Find the docker volume name for the Postgres database
 * @returns {string} - Docker volume name
 */
function findPostgresVolume() {
    const out = execSync('docker volume ls --format "{{.Name}}"').toString();
    const vols = out.split('\n').map(s => s.trim()).filter(Boolean);
    
    // List all postgres-related volumes for debugging
    const pgVols = vols.filter(n => n.includes('postgres'));
    console.log('Found postgres-related volumes:', pgVols.join(', ') || 'none');
    
    // Prefer compose-prefixed volume first (e.g., smart-sandbox_postgres_data)
    let v = vols.find(n => n.endsWith('_postgres_data') && n !== 'postgres_data');
    if (v) return v;
    // Then exact match
    v = vols.find(n => n === 'postgres_data');
    if (v) return v;
    // fallback: any name that contains postgres_data
    v = vols.find(n => n.includes('postgres_data'));
    if (v) return v;
    throw new Error('docker volume for postgres not found. Available volumes: ' + vols.join(', '));
}

module.exports = {
    clearUploadLog,
    hapiIsRunning,
    waitForHapi,
    findPostgresVolume,
    sleep,
    run,
};