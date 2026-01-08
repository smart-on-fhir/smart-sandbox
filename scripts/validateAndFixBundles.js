const fs          = require('fs');
const path        = require('path');
const { readDir } = require('./lib');
const { DATA_DIR, HAPI_FHIR_BASE_URL } = require('./config');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// FHIR server configuration
const HEADERS = { "Content-Type": "application/fhir+json" };

// Directories
const INPUT_DIR  = DATA_DIR;
const OUTPUT_DIR = DATA_DIR;
const LOG_FILE   = path.join(__dirname, "../logs/validation-errors.log");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Validate a FHIR bundle using the HAPI FHIR server
 * @param {fhir4.Bundle} bundle - The FHIR bundle to validate
 * @returns {Promise<fhir4.OperationOutcome>} - The validation result
 */
async function validateBundle(bundle) {

    const response = await fetch(`${HAPI_FHIR_BASE_URL}/Bundle/$validate`, {
        method : "POST",
        headers: HEADERS,
        body   : JSON.stringify(bundle),
    });

    if (!response.ok) {
        const json = await response.json();
        let msg = `Validation request failed: ${response.status}`;
        if (json.issue && json.issue.length > 0) {
            // @ts-ignore
            msg += json.issue.filter(issue => issue.severity !== "information" && issue.severity !== "warning").map(issue => {
                return "\n  ⚠️  issue: " +issue.diagnostics + "\n        at: " + issue.location.join(", ");
            }).join("; ");
        }
        
        throw new Error(msg);
    }

    return response.json();
}

/**
 * Attempt to fix common issues in a FHIR bundle
 * @param {fhir4.Bundle} bundle - The FHIR bundle to fix
 * @param {fhir4.OperationOutcome} validationResult - The validation result
 * @returns {fhir4.Bundle} - The fixed bundle
 */
function fixBundle(bundle, validationResult) {
    // Example: Add missing meta field if required
    if (!bundle.meta) {
        bundle.meta = { "lastUpdated": new Date().toISOString() };
    }

    // Example: Fix invalid resource references
    if (validationResult.issue) {
        validationResult.issue.forEach((issue) => {
            if (issue.diagnostics && issue.diagnostics.includes("Invalid reference")) {
                const match = issue.diagnostics.match(/Resource (\w+)\/\w+/);
                if (match) {
                    const resourceType = match[1];
                    if (bundle.entry) {
                        bundle.entry.forEach((entry) => {
                            if (entry.resource && entry.resource.resourceType === resourceType) {
                                entry.resource.id = entry.resource.id || "fixed-id";
                            }
                        });
                    }
                }
            }
        });
    }

    return bundle;
}

/**
 * Process all bundles in the input directory
 */
async function processBundles() {
    console.log(`\nProcessing bundles in ${INPUT_DIR}...\n`);

    const entries = readDir(INPUT_DIR, { recursive: true, filter: /\.json$/ });
    const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });

    for (const file of entries) {
        console.log(`Processing ${file}...`);

        const relativePath   = path.relative(INPUT_DIR, file);
        const outputFilePath = path.join(OUTPUT_DIR, relativePath);
        
        const outputDir = path.dirname(outputFilePath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const bundle = JSON.parse(fs.readFileSync(file, "utf8"));

        try {
            const validationResult = await validateBundle(bundle);

            // Filter out informational and warning messages from validation results
            validationResult.issue = validationResult.issue.filter(
                (issue) => issue.severity !== "information" && issue.severity !== "warning"
            );

            if (validationResult.issue && validationResult.issue.length > 0) {
                logStream.write(`    Validation issues for ${relativePath}:\n`);
                validationResult.issue.forEach((issue) => {
                    logStream.write(`    - ${issue.severity}: ${issue.diagnostics}\n`);
                });

                // Attempt to fix the bundle
                const fixedBundle = fixBundle(bundle, validationResult);
                fs.writeFileSync(outputFilePath, JSON.stringify(fixedBundle, null, 4));
                console.log(`    Fixed and saved: ${outputFilePath}`);
            } else {
                console.log(`    No issues found`);
                fs.writeFileSync(outputFilePath, JSON.stringify(bundle, null, 4));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`    Failed to process ${relativePath}: ${errorMessage}`);
            logStream.write(`    Failed to process ${relativePath}: ${errorMessage}\n`);
        }
    }

    logStream.end();
    console.log("Processing complete. See validation-errors.log for details.");
}

processBundles().catch((err) => console.error("Error:", err));