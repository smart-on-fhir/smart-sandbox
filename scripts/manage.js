#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
const backupsDir = path.join(root, 'backups');

// ANSI colors
const colors = {
  reset : '\x1b[0m',
  bright: '\x1b[1m',
  dim   : '\x1b[2m',
  green : '\x1b[32m',
  yellow: '\x1b[33m',
  blue  : '\x1b[34m',
  cyan  : '\x1b[36m',
  red   : '\x1b[31m',
};

/**
 * Apply color to text
 * @param {keyof typeof colors} c 
 * @param {string|number} text 
 * @returns 
 */
function color(c, text) {
  return `${colors[c]}${text}${colors.reset}`;
}

/**
 * Create a readline prompt
 * @returns {import('readline').Interface}
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and get user input
 * @param {string} question 
 * @param {string} defaultValue 
 * @returns {Promise<string>}
 */
async function ask(question, defaultValue = '') {
  const rl = createPrompt();
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Confirm a yes/no question
 * @param {string} question 
 * @param {boolean} defaultYes 
 * @returns {Promise<boolean>}
 */
async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${question} ${hint}`, defaultYes ? 'y' : 'n');
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Present a selection menu to the user
 * @param {string} question 
 * @param {Array<{label: string, [key: string]: any}>} options 
 * @returns {Promise<{label: string, [key: string]: any}>}
 */
async function select(question, options) {
  console.log(`\n${color('cyan', question)}\n`);
  options.forEach((opt, i) => {
    console.log(`  ${color('bright', (i + 1).toString().padStart(3))}. ${opt.label}`);
  });
  console.log();

  while (true) {
    const answer = await ask('Enter choice');
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    console.log(color('red', `Please enter a number between 1 and ${options.length}`));
  }
}

/**
 * Run a script as a child process
 * @param {string} scriptPath 
 * @param {string[]} args 
 * @param {object} options 
 * @returns {Promise<void>}
 */
function runScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd: root,
      stdio: 'inherit',
      ...options,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Get list of available backups
 * @returns {string[]}
 */
function getBackups() {
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir)
    .filter(f => f.endsWith('.tar.gz'))
    .sort()
    .reverse();
}

/**
 * Get Docker container status
 * @returns {Array<{Service: string, State: string, Health?: string}>}
 */
function getContainerStatus() {
  try {
    const output = execSync('docker compose ps --format json', {
      cwd: root,
      encoding: 'utf8',
    });
    const lines = output.trim().split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Print container status
 * @returns {void}
 */
function printStatus() {
  console.log(`\n${color('bright', '📊 Container Status:')}\n`);
  const containers = getContainerStatus();
  if (containers.length === 0) {
    console.log('  No containers running');
  } else {
    containers.forEach(c => {
      const status = c.State === 'running' ? color('green', '●') : color('red', '○');
      const health = c.Health ? ` (${c.Health})` : '';
      console.log(`  ${status} ${c.Service}: ${c.State}${health}`);
    });
  }
  console.log();
}

// ===== ACTIONS =====

/**
 * Upload patients from seed-data directory
 * @returns {Promise<void>}
 */
async function actionUploadPatients() {
  console.log(`\n${color('cyan', '📤 Upload Patients')}\n`);
  console.log('This will upload patient bundles from the seed-data directory.\n');

  if (!await confirm('Continue with upload?', true)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'uploadPatients.js'));
  } catch (err) {
    console.error(color('red', '\nUpload failed:'), err + '');
  }
}

/**
 * Reset the FHIR server (delete all data)
 * @returns {Promise<void>}
 */
async function actionResetServer() {
  console.log(`\n${color('red', '⚠️  Reset Server')}\n`);
  console.log('This will PERMANENTLY DELETE ALL DATA from the FHIR server!\n');
  console.log('The database will be dropped and recreated.\n');

  if (!await confirm('Are you sure you want to reset?', false)) {
    console.log('Cancelled.');
    return;
  }

  if (!await confirm('This cannot be undone. Really reset?', false)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'resetServer.js'), ['--confirm']);
    console.log(color('green', '\n✅ Server reset complete!'));
  } catch (err) {
    console.error(color('red', '\nReset failed:'), err + '');
  }
}

/**
 * Create a backup of the Postgres data volume
 * @returns {Promise<void>}
 */
async function actionCreateBackup() {
  console.log(`\n${color('cyan', '💾 Create Backup')}\n`);
  console.log('This will create a backup of the PostgreSQL data volume.\n');

  if (!await confirm('Create backup now?', true)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'makeBackup.js'));
    console.log(color('green', '\n✅ Backup created!'));
  } catch (err) {
    console.error(color('red', '\nBackup failed:'), err + '');
  }
}

/**
 * Restore a backup from the backups directory
 * @returns {Promise<void>}
 */
async function actionRestoreBackup() {
  console.log(`\n${color('cyan', '📥 Restore Backup')}\n`);

  const backups = getBackups();
  if (backups.length === 0) {
    console.log(color('yellow', 'No backups found in backups/ directory.'));
    return;
  }

  console.log('Available backups:\n');
  /** @type {Array<{label: string, value: string | null}>} */
  const options = backups.map(b => {
    const stats = fs.statSync(path.join(backupsDir, b));
    const size = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
    return { label: `${b} (${size})`, value: b };
  });
  options.push({ label: 'Cancel', value: null });

  const choice = await select('Select backup to restore:', options);
  if (!choice.value) {
    console.log('Cancelled.');
    return;
  }

  console.log(`\n${color('yellow', 'Warning:')} This will replace all current data with the backup!\n`);

  if (!await confirm('Restore this backup?', false)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'restoreBackup.js'), [choice.value]);
    console.log(color('green', '\n✅ Restore complete!'));
  } catch (err) {
    console.error(color('red', '\nRestore failed:'), err + '');
  }
}

/**
 * List available backups
 * @returns {Promise<void>}
 */
async function actionListBackups() {
  console.log(`\n${color('cyan', '📋 Available Backups')}\n`);

  const backups = getBackups();
  if (backups.length === 0) {
    console.log(color('yellow', 'No backups found in backups/ directory.'));
    return;
  }

  backups.forEach((b, i) => {
    const stats = fs.statSync(path.join(backupsDir, b));
    const size = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
    console.log(`  ${i + 1}. ${b} (${size})`);
  });
  console.log();
}

/**
 * Delete a backup
 * @returns {Promise<void>}
 */
async function actionDeleteBackup() {
  console.log(`\n${color('cyan', '🗑️  Delete Backup')}\n`);

  const backups = getBackups();
  if (backups.length === 0) {
    console.log(color('yellow', 'No backups found in backups/ directory.'));
    return;
  }

  /** @type {Array<{label: string, value: string | null}>} */
  const options = backups.map(b => {
    const stats = fs.statSync(path.join(backupsDir, b));
    const size = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
    return { label: `${b} (${size})`, value: b };
  });
  options.push({ label: 'Cancel', value: null });

  const choice = await select('Select backup to delete:', options);
  if (!choice.value) {
    console.log('Cancelled.');
    return;
  }

  if (!await confirm(`Delete ${choice.value}?`, false)) {
    console.log('Cancelled.');
    return;
  }

  fs.unlinkSync(path.join(backupsDir, choice.value));
  console.log(color('green', '\n✅ Backup deleted!'));
}

/**
 * Manage Docker containers
 * @returns {Promise<void>}
 */
async function actionManageContainers() {
  console.log(`\n${color('cyan', '🐳 Manage Containers')}\n`);

  const options = [
    { label: 'Start all containers', value: 'start' },
    { label: 'Stop all containers', value: 'stop' },
    { label: 'Restart all containers', value: 'restart' },
    { label: 'Restart HAPI only', value: 'restart-hapi' },
    { label: 'View logs (HAPI)', value: 'logs-hapi' },
    { label: 'View logs (Postgres)', value: 'logs-postgres' },
    { label: 'Cancel', value: null },
  ];

  const choice = await select('Select action:', options);
  if (!choice.value) return;

  try {
    switch (choice.value) {
      case 'start':
        execSync('docker compose up -d', { cwd: root, stdio: 'inherit' });
        break;
      case 'stop':
        execSync('docker compose stop', { cwd: root, stdio: 'inherit' });
        break;
      case 'restart':
        execSync('docker compose restart', { cwd: root, stdio: 'inherit' });
        break;
      case 'restart-hapi':
        execSync('docker compose restart hapi-fhir', { cwd: root, stdio: 'inherit' });
        break;
      case 'logs-hapi':
        execSync('docker compose logs -f --tail 100 hapi-fhir', { cwd: root, stdio: 'inherit' });
        break;
      case 'logs-postgres':
        execSync('docker compose logs -f --tail 100 postgres', { cwd: root, stdio: 'inherit' });
        break;
    }
  } catch (err) {
    // User may Ctrl+C out of logs, that's fine
  }
}

/**
 * Validate FHIR bundles
 * @returns 
 */
async function actionValidateBundles() {
  console.log(`\n${color('cyan', '✅ Validate Bundles')}\n`);

  if (!fs.existsSync(path.join(__dirname, 'validateAndFixBundles.js'))) {
    console.log(color('yellow', 'validateAndFixBundles.js not found.'));
    return;
  }

  if (!await confirm('Run bundle validation?', true)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'validateAndFixBundles.js'));
  } catch (err) {
    console.error(color('red', '\nValidation failed:'), err + '');
  }
}

async function shiftDates() {
  console.log(`\n${color('cyan', '⏱️  Shift Dates')}\n`);
  console.log('This will update all dates in the data directory and shift them forward to maintain patient ages.\n');

  if (!await confirm('Continue?', true)) {
    console.log('Cancelled.');
    return;
  }

  try {
    await runScript(path.join(__dirname, 'timeShift.js'));
  } catch (err) {
    console.error(color('red', '\nShift dates failed:'), err + '');
  }
}

// ===== MAIN MENU =====

async function mainMenu() {
  console.clear();
  console.log(color('bright', '╔════════════════════════════════════════╗'));
  console.log(color('bright', '║     SMART Sandbox Management CLI       ║'));
  console.log(color('bright', '╚════════════════════════════════════════╝'));

  printStatus();

  const options = [
    { label: '📤  Upload patients\n', action: actionUploadPatients },
    { label: '💾  Create backup\n', action: actionCreateBackup },
    { label: '📥  Restore backup\n', action: actionRestoreBackup },
    { label: '📋  List backups\n', action: actionListBackups },
    { label: '🗑️   Delete backup\n', action: actionDeleteBackup },
    { label: '⚠️   Reset server (delete all data)\n', action: actionResetServer },
    { label: '✅  Validate and fix bundles\n', action: actionValidateBundles },
    { label: '🐳  Manage containers\n', action: actionManageContainers },
    { label: '⏱️   Shift Dates\n', action: shiftDates },
    { label: '❌  Exit', action: null },
  ];

  const choice = await select('What would you like to do?', options);

  if (choice.action) {
    await choice.action();
    console.log();
    await ask('Press Enter to continue...');
    return mainMenu();
  }

  console.log('\nGoodbye! 👋\n');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nGoodbye! 👋\n');
  process.exit(0);
});

// Run
mainMenu().catch(err => {
  console.error(color('red', 'Error:'), err.message);
  process.exit(1);
});
