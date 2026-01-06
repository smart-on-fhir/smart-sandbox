const { waitForHapi, run, clearUploadLog, hapiIsRunning } = require('./lib');

// Disable SSL verification for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

(async function main() {

    // Safety check
    if (!process.argv.includes('--confirm')) {
        console.log("⚠️  This will PERMANENTLY DELETE ALL DATA from the FHIR server!");
        console.log("\nThis script will:");
        console.log("  1. Stop HAPI");
        console.log("  2. Drop and recreate the database");
        console.log("  3. Restart HAPI and rebuild the schema");
        console.log("\nRun with --confirm to proceed:");
        console.log("  node scripts/resetServer.js --confirm");
        return;
    }

    console.log("🗑️  Resetting the FHIR server database...\n");

    const hapiWasRunning = hapiIsRunning();

    // Step 1: Stop HAPI
    console.log("Step 1: Stopping HAPI...");
    run("docker compose stop hapi-fhir");

    // Step 2: Drop and recreate database
    console.log("\nStep 2: Resetting database...");
    run(`docker compose exec -T postgres bash -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"'`);
    run(`docker compose exec -T postgres bash -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"'`);

    // Step 3: Restart HAPI only if it was running before
    if (hapiWasRunning) {
        console.log("\nStep 3: Restarting HAPI (with DDL create)...");
        // Use 'create' to build schema from scratch in the empty database
        run("HIBERNATE_DDL_AUTO=create docker compose up -d hapi-fhir");
        await waitForHapi();
    } else {
        console.log("\nStep 3: HAPI was not running, skipping restart.");
    }

    clearUploadLog();

    console.log("\n✅ Reset complete!");
    console.log("HAPI will rebuild the schema on startup.");
    console.log("You can now run: node scripts/uploadPatients.js");

})().catch(err => console.error("Error:", err));