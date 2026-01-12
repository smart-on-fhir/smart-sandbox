const FS              = require("fs");
const Path            = require("path");
const moment          = require("moment");
const { DATA_DIR }    = require("./config");
const { forEachFile } = require("./lib");


/**
 * @type {{[key in import("fhir/r4").Resource["resourceType"]]: string[]}}
 */
const jsonPaths = {
    Patient: [
        "birthDate",
        "deceasedDateTime"
    ],
    Encounter: [
        "statusHistory..period.start",
        "statusHistory..period.end",
        "classHistory..period.start",
        "classHistory..period.end",
        "participant..period.start",
        "participant..period.end",
        "location..period.start",
        "location..period.end",
        "period.start",
        "period.end"
    ],
    Condition: [
        "onsetDateTime",
        "recordedDate",
        "dateRecorded",
        "abatementDateTime",
        "abatementRange.start",
        "abatementRange.end",
        "assertedDate"
    ],
    MedicationRequest: [
        "authoredOn",
        "dispenseRequest.validityPeriod.start",
        "dispenseRequest.validityPeriod.end"
    ],
    Claim: [
        "billablePeriod.start",
        "billablePeriod.end",
        "created"
    ],
    CarePlan: [
        "period.start",
        "period.end"
    ],
    ExplanationOfBenefit: [
        "billablePeriod.start",
        "billablePeriod.end",
        "created"
    ],
    Organization: [],
    Practitioner: [],
    Observation: [
        "effectiveDateTime",
        "effectivePeriod.start",
        "effectivePeriod.end",
        // "effectivePeriod.created",
        "effectiveTiming..event",
        "effectiveInstant",
        "issued",
        "valueDateTime",
        "valuePeriod.start",
        "valuePeriod.end",
        "valuePeriod.created",
        "component..valueDateTime",
        "component..valuePeriod.start",
        "component..valuePeriod.end",
        "component..valuePeriod.created"
    ],
    Immunization: [
        "occurrenceDateTime",
        "recorded",
        "expirationDate",
        "education..publicationDate",
        "education..presentationDate",
        "reaction..date"
    ],
    DiagnosticReport: [
        "effectiveDateTime",
        "effectivePeriod.start",
        "effectivePeriod.end",
        // "effectivePeriod.created",
        "issued"
    ],
    Procedure: [
        "performedDateTime",
        "performedPeriod.start",
        "performedPeriod.end",
        "performedPeriod.created"
    ],
    ImagingStudy: [
        "started",
        "series..started"
    ],
    Goal: [
        "startDate",
        "target..dueDate",
        "statusDate"
    ],
    AllergyIntolerance: [
        "onsetDateTime",
        "onsetPeriod.start",
        "onsetPeriod.end",
        "onsetPeriod.created",
        "recordedDate",
        "reaction..onset"
    ],
    MedicationOrder: [
        "dateWritten",
        "dateEnded",
        "dispenseRequest.validityPeriod.start",
        "dispenseRequest.validityPeriod.end"
    ],
    MedicationStatement: [
        "dateAsserted",
        "effectiveDateTime",
        "effectivePeriod.start",
        "effectivePeriod.end"
    ],
    Schedule: [
        "planningHorizon.start",
        "planningHorizon.end"
    ],
    Slot: [
        "start",
        "end"
    ],
    Appointment: [
        "start",
        "end",
        "created",
        "participant..period.start",
        "participant..period.end",
        "requestedPeriod..start",
        "requestedPeriod..end"
    ],
    AppointmentResponse: [
        "start",
        "end"
    ],
    Coverage: [
        "period.start",
        "period.end",
        "costToBeneficiary..exception..period.start",
        "costToBeneficiary..exception..period.end"
    ],
    FamilyMemberHistory: [
        "date",
        "bornPeriod.start",
        "bornPeriod.end",
        "bornDate",
        "deceasedDate",
        "condition..onsetPeriod.start",
        "condition..onsetPeriod.end"
    ],
    NutritionOrder: [
        "dateTime",
        "supplement..schedule..event",
        "supplement..schedule.boundsPeriod.start",
        "supplement..schedule.boundsPeriod.end",
        "enteralFormula.administration..schedule.boundsPeriod.start",
        "enteralFormula.administration..schedule.boundsPeriod.end",
        "oralDiet..schedule.boundsPeriod.start",
        "oralDiet..schedule.boundsPeriod.end",
    ],
    ValueSet: [
        "date",
        "lockedDate",
        "compose.lockedDate",
        "expansion.timestamp",
        "expansion.parameter..valueDateTime"
    ],
    Questionnaire: [
        "date",
        "approvalDate",
        "lastReviewDate",
        "effectivePeriod.start",
        "effectivePeriod.end",
        "item..enableWhen..answerDate",
        "item..enableWhen..answerDateTime",
        "item..option..valueDate",
        "item..answerOption..valueDate",
        "item..initialDate",
        "item..initialDateTime",
        "item..initial..valueDate",
        "item..initial..valueDateTime"
    ],
    QuestionnaireResponse: [
        "authored",
        "group.question..answer..valueDate",
        "group.question..answer..valueDateTime",
        "group.question..answer..valueInstant"
    ],
    MedicationDispense: [
        "whenPrepared",
        "whenHandedOver",
        "dosageInstruction..timing..event",
        "dosageInstruction..timing.repeat.boundsPeriod.start",
        "dosageInstruction..timing.repeat.boundsPeriod.end"
    ],
    Binary: [],
    DocumentReference: [
        "date",
        "created",
        "indexed",
        "context.period.start",
        "context.period.end"
    ],
    Medication: [
        "product.batch..expirationDate",
        "package.batch..expirationDate",
        "batch.expirationDate"
    ]
};

const dateFormats = {
    instant: {
        re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-]\d{2}:\d{2}|[zZ])\b/g,
        format: "YYYY-MM-DDTHH:mm:ss.SSSZ"
    },
    date: {
        // Note that we intentionally do NOT support partial
        // dates like YYYY or YYYY-MM
        re: /\b\d{4}-\d{2}-\d{2}\b/g,
        format: "YYYY-MM-DD"
    },
    dateTime: {
        // Note that we intentionally do NOT support partial
        // dates like YYYY or YYYY-MM
        re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|[zZ])\b/g,
        format: "YYYY-MM-DDTHH:mm:ssZ"
    }
};

/**
 * IMPORTANT: This is approximately the date when the patients have been
 * originally generated. We use that to compute the amount of time to shift
 * with so that the patients maintain the same age. For example, if today is
 * 2024-05-01 and the anchor date is 2019-04-29, we need to shift all dates
 * by +5 years and 2 days.
 * 
 * HOWEVER, if some patient files have been added later, this will be incorrect!
 * We do not support custom data yet, but when we do, we need to make sure that
 * the files live in different folder and we apply different shift rules to them
 * (for example  based on file creation date).
 */
// const anchorDate = '2019-04-29';

/**
 * Tests if the given argument is an object
 * @param {*} x The value to test
 * @returns {boolean}
 */
function isObject(x) {
    return !!x && typeof x == "object";
}

/**
 * @param {string} input 
 * @param {number} amount 
 * @param {moment.DurationInputArg2} units
 * @returns {string} 
 */
function shiftDatesInText(input, amount, units) {
    return input
        .replace(dateFormats.instant.re , all => timeShift(all, amount, units, dateFormats.instant.format ))
        .replace(dateFormats.dateTime.re, all => timeShift(all, amount, units, dateFormats.dateTime.format))
        .replace(dateFormats.date.re    , all => timeShift(all, amount, units, dateFormats.date.format    ))
}

/**
 * Determines the date format for the given FHIR date-like input value
 * @param {string} input 
 * @returns {string}
 */
function getDateFormat(input) {
    switch (input.length) {
        case 2 : return "YY";
        case 4 : return "YYYY";
        case 7 : return "YYYY-MM";
        case 10: return "YYYY-MM-DD";
        case 19: return "YYYY-MM-DDTHH:mm:ssZ";
        default:
            return input.match(/T\d{2}:\d{2}:\d{2}\.\d{3,}/) ?
                "YYYY-MM-DDTHH:mm:ss.SSSZ" :
                "YYYY-MM-DDTHH:mm:ssZ";
    }
}

/**
 * Shifts a FHIR date-like input value with the given amount of time
 * @param {string} input 
 * @param {number} amount 
 * @param {moment.DurationInputArg2} units
 * @param {string|null} format
 * @returns {string} 
 */
function timeShift(input, amount, units, format = null) {
    if (!format) {
        format = getDateFormat(input);
    }
    const inputMoment = moment.utc(input, true);
    if (amount < 0) {
        inputMoment.subtract(Math.abs(amount), units);
    } else {
        inputMoment.add(amount, units);
    }
    return inputMoment.format(format);
}

/**
 * Finds a path in the given object and calls the callback for each match
 * @param {object} obj
 * @param {string | string[] | number} path
 * @param {(parent: any, key: string, value: any, path: string) => any} callback
 * @param {string[]} [_pathSoFar = []]
 * @returns {void}
 */
function loopPath(obj, path, callback, _pathSoFar = []) {
    
    // The path can be an array of segments or a dot-separated path. When called
    // recursively it will be an array
    const segments = Array.isArray(path) ? path : String(path).split(".");

    // Empty path is not valid
    if (!segments.length) {
        throw new Error("Path cannot be empty");
    }

    // Get the current key
    const key = segments.shift() + "";

    // Update the current path 
    _pathSoFar.push(key);

    // Early exit if the path is trying to dive into scalar value
    if (segments.length && !isObject(obj)) {
        return;
    }

    // If this was the last path segment call the callback and exit
    if (!segments.length) {
        if (isObject(obj)) {
            // @ts-ignore
            callback(obj, key, obj[key], _pathSoFar.join("."));
        }
        return;
    }

    // Empty key means we are in ".." operator
    if (!key) {

        // The ".." operator is only valid for arrays. Trying to use it on
        // non-array node means no match, thus we can exit
        if (!Array.isArray(obj)) {
            return;
        }

        // Dive into the array
        return obj.forEach(entry => loopPath(entry, [...segments], callback, _pathSoFar));
    }

    // Step in
    if (segments.length) {
        // @ts-ignore
        return loopPath(obj[key], [...segments], callback, _pathSoFar);
    }

    if (isObject(obj) && key in obj) {
        // @ts-ignore
        callback(obj, key, obj[key], _pathSoFar.join("."));
    }
}

/**
 * @param {import("fhir/r4").DomainResource} json
 * @param {(path: string, value: any) => any} transform
 */
function transformJSON(json, transform)
{
    if (json.resourceType === "Bundle") {
        // @ts-ignore
        json.entry = (json.entry || []).map(entry => {
            if (entry.resource) transformJSON(entry.resource, transform);
            return entry;
        });
        return json;
    }

    // Replace dates in text.div
    let val = json.text ? json.text.div : null;
    if (json.text && json.text.div) {
        json.text.div = transform("text.div", val);
    }

    const paths = jsonPaths[json.resourceType];
    if (paths) {
        paths.forEach(path => {
            loopPath(json, path, (prt, key, val, currentPath) => {
                if (val) {
                    prt[key] = transform(currentPath, val);
                    // console.log(" - " + json.resourceType + "." + currentPath, ": ", val, " => ", prt[key]);
                }
            });
        });
    } else {
        throw new Error(`No paths defined for "${json.resourceType}" resource type!`)
    }

    return json;
}

/**
 * @param {object} options 
 * @param {string} options.inputDir 
 * @param {string} options.outputDir
 * @param {number} options.shiftAmount The shift amount (can also be negative)
 * @param {moment.DurationInputArg2} options.shiftUnits year, years, month, months, days, day etc.
 * @param {boolean} options.verbose Log every transformation
 */
function shift(options)
{
    let transforms = 0;
    let startTime = Date.now();

    /**
     * Processes a JSON file
     * @param {import("fhir/r4").DomainResource} json 
     * @param {string} path 
     */
    function processJSON(json, path) {
        // console.log(`Processing JSON file ${path}`);
        const start = transforms
        save(path, JSON.stringify(
            transformJSON(json, (p, v) => {
                let newValue = v;
                if (p.match(/\btext\.div\b/)) {
                    newValue = shiftDatesInText(v, options.shiftAmount, options.shiftUnits);
                } else {
                    newValue = timeShift(v, options.shiftAmount, options.shiftUnits);
                }
                if (newValue !== v) {
                    transforms += 1;
                    options.verbose && console.log(p.padEnd(30), ": ", v.padEnd(30), " => ", newValue);
                }
                return newValue;
            }),
            null,
            4
        ));
        console.log(`${Path.basename(path).padEnd(65)} - ${Number(transforms - start).toLocaleString("en-US")} dates shifted`);
    }

    /**
     * Saves the given data to the given path in the output directory
     * @param {string} path 
     * @param {string} data 
     */
    function save(path, data) {
        const dirPath = Path.resolve(options.inputDir);
        const dest = path.replace(dirPath, options.outputDir)
        FS.mkdirSync(Path.dirname(dest), { recursive: true });
        FS.writeFileSync(dest, data);
    }

    /**
     * Processes a file with the given contents and path
     * @param {string} contents 
     * @param {string} path 
     */
    function processFile(contents, path) {
        if (path.endsWith(".json")) {
            processJSON(JSON.parse(contents), path);
        }
    }

    forEachFile(Path.resolve(options.inputDir), processFile, { recursive: true, filter: /\.json$/ });

    console.log(`Shifted ${Number(transforms).toLocaleString("en-US")} dates in ${Math.round((Date.now() - startTime)/1000)} seconds`);
};

/**
 * 
 * @param {string} inputDir 
 * @param {string} dateStr 
 */
function setAnchorDate(inputDir, dateStr) {
    const anchorFile = Path.join(inputDir, ".anchorDate");
    FS.writeFileSync(anchorFile, dateStr, "utf8");
    console.log(`Anchor date set to ${dateStr} in file "${anchorFile}"`);
}


/**
 * Recursively walk the data directory to find all subdirectories. This means
 * that if we have data for multiple FHIR versions, we will process each
 * version separately. It also means we can't have data directly under DATA_DIR,
 * but should always have at least one subdirectory.
 * @param {string} dir 
 * @returns {number}
 */
function walkDir(dir = DATA_DIR) {
    let result = 0;
    const files = FS.readdirSync(dir);
    for (const file of files) {
        const fullPath    = Path.join(dir, file);
        const isDirectory = FS.statSync(fullPath).isDirectory();
        if (isDirectory) {
            const anchorFile = Path.join(fullPath, ".anchorDate");
            if (FS.existsSync(anchorFile)) {
                console.log(`Found anchor date file: ${anchorFile}`);
                const anchorDateStr = FS.readFileSync(anchorFile, "utf8").trim();
                const anchorDate = moment.utc(anchorDateStr, "YYYY-MM-DD", true);
                if (!anchorDate.isValid()) {
                    console.error(
                        `Error: Invalid anchor date "${anchorDateStr}" in file "${anchorFile
                        }". Expected format is "YYYY-MM-DD".`
                    );
                    return 0;
                }
                
                const diff = moment().utc().diff(moment(anchorDate).utc(), 'days');
                if (diff === 0) {
                    console.log("No time shift needed for %s.", fullPath);
                    return walkDir(fullPath);
                }

                console.log(`Shifting all dates by ${diff} days to maintain patient ages (anchor date: ${anchorDate})\n`);
                shift({
                    inputDir   : fullPath,
                    outputDir  : fullPath,
                    shiftAmount: diff,
                    shiftUnits : 'days',
                    verbose    : false
                });
                setAnchorDate(fullPath, moment().utc().format("YYYY-MM-DD"));
                result += 1;

            } else {
                console.log(`No anchor date file found in: ${fullPath}`);
            }
            result += walkDir(fullPath);
        }
    }
    return result;
}

console.log();
console.log('-----------------------------------------------------');
console.log(`${new Date().toISOString()} Starting time shift in data dir: ${DATA_DIR}`);
console.log('-----------------------------------------------------');
console.log();

// Recursively walk the data directory to try shifting all subdirectories
const shifts = walkDir();

console.log(`Time shift complete. ${shifts} dataset(s) processed.`);

// If nothing was shifted, exit with error code so that piped commands can catch it
process.exit(shifts ? 0 : 1);
