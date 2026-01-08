const fs          = require('fs');
const { readDir } = require('./lib');
const {
    DATA_DIR,
    UPLOAD_LOG_FILE,
    HAPI_FHIR_BASE_URL
} = require('../scripts/config');



// Disable SSL verification for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Load the set of already uploaded files. This prevents re-uploading on
 * subsequent runs. Only files not in this set will be uploaded, meaning that
 * failed uploads can be retried by re-running the script.
 * @returns {Set<string>}
 */
function loadUploadedFiles() {
    try {
        if (fs.existsSync(UPLOAD_LOG_FILE)) {
            const data = JSON.parse(fs.readFileSync(UPLOAD_LOG_FILE, 'utf8'));
            return new Set(data);
        }
    } catch (error) {
        console.warn("Could not load upload log, starting fresh:", error + "");
    }
    return new Set();
}

/**
 * Save the set of uploaded files
 * @param {Set<string>} uploadedFiles
 */
function saveUploadedFiles(uploadedFiles) {
    fs.writeFileSync(UPLOAD_LOG_FILE, JSON.stringify([...uploadedFiles], null, 2));
}

/**
 * Function to send a bundle to the FHIR server. We are making some in-memory
 * modifications to the bundle to ensure proper upload:
 * - Set fullUrl for each entry if not already set
 * - Set request method to PUT and URL to ResourceType/id for each entry. This
 *   ensures that resources are created/updated correctly on the server and the
 *   resource IDs are preserved.
 * @param {fhir4.Bundle} bundle - The FHIR bundle to send
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function sendBundle(bundle) {
    try {

        bundle.entry?.forEach(entry => {
            if (entry.resource && entry.resource.resourceType && entry.resource.id) {
                // Preserve existing fullUrl if it exists, otherwise set it
                entry.fullUrl = entry.fullUrl || `urn:uuid:${entry.resource.id}`;

                // Set the request method and URL
                entry.request = {
                    method: "PUT",
                    url: `${entry.resource.resourceType}/${entry.resource.id}`
                };
            } else {
                console.warn("Skipping entry without resourceType or id:", entry);
            }
        });

        const response = await fetch(HAPI_FHIR_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/fhir+json" },
            body: JSON.stringify(bundle),
        });

        if (response.ok) {
            return true;
        }

        if (!response.headers.get("Content-Type")?.match(/\bjson\b/)) {
            const txt = await response.text();
            console.error("Failed to upload bundle:", response.status, response.statusText, txt.substring(0, 800) + "...");
        }
        else {
            /** @type {fhir4.OperationOutcome} */
            const oo = await response.json();
            if (oo.resourceType !== "OperationOutcome") {
                console.error("Failed to upload bundle:", response.status, response.statusText, oo);
            }
            else {
                console.error(
                    "Failed to upload bundle:", response.status, response.statusText, '\n\t' + oo.issue
                    .filter(issue => (issue.severity === "error" || issue.severity === "fatal"))
                    .map(issue => issue.severity + ": " + issue.diagnostics)
                    .join("\n\t")
                );
            }
        }
        return false;
    } catch (error) {
        console.error("Failed to upload bundle:", error + '');
        return false;
    }
}

// Main function to process files
async function main() {

    const files = Array.from(readDir(DATA_DIR, { recursive: true, filter: /\.json$/ }));
    
    // Load previously uploaded files
    const uploadedFiles = loadUploadedFiles();
    const pendingFiles = files.filter(file => !uploadedFiles.has(file));
    
    // The upload script can be stopped and restarted which messes up the logic here
    if (pendingFiles.length === 0) {
        console.log("All files have already been uploaded. You have 2 options:");
        console.log("  1. Do nothing");
        console.log("  2. Use node scripts/resetServer.js to reset the server and then re-upload all data from scratch.");
        return;
    }

    console.log(`Found ${files.length} total files, ${pendingFiles.length} pending upload`);
    
    let index = 0;
    let successCount = 0;
    let failCount = 0;

    for (const file of pendingFiles) {
        console.log(`${++index} of ${pendingFiles.length}: Loading file ${file} ...`);
        const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
        const success = await sendBundle(bundle);
        
        if (success) {
            uploadedFiles.add(file);
            saveUploadedFiles(uploadedFiles);
            successCount++;
        } else {
            failCount++;
        }
    }

    console.log(`\nDone! Success: ${successCount}, Failed: ${failCount}`);
    if (failCount > 0) {
        console.log("Run the script again to retry failed uploads.");
    }
}

main().catch(err => console.error("Error:", err));
