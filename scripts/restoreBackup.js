const { execSync }           = require('child_process');
const fs                     = require('fs');
const path                   = require('path');
const { findPostgresVolume } = require('./lib');

const root = path.resolve(__dirname, '..');
const backupsDir = path.join(root, 'backups');
const composeFile = path.join(root, 'docker-compose.yml');

if (!fs.existsSync(backupsDir))  {
    console.error('The backups dir (%s) was not found. Please create a backup first.', backupsDir);
    process.exit(1);
}

const volumeName = findPostgresVolume();
console.log('Using docker volume:', volumeName);

let file = process.argv[2];
if (!file) {
  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.tar.gz')).sort();
  if (!files.length) throw new Error('no backup files found in backups dir');
  file = files[files.length - 1];
}
const backupPath = path.join(backupsDir, file);
if (!fs.existsSync(backupPath)) throw new Error('backup file not found: ' + backupPath);

console.log('Stopping postgres container...');
execSync(`docker compose -f '${composeFile}' stop postgres`, { stdio: 'inherit' });

console.log('Restoring from', backupPath);
execSync(`docker run --rm -v "${volumeName}:/data" -v '${backupsDir}':/backup alpine sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null || true && tar xzf /backup/${file} -C /data"`, { stdio: 'inherit' });

console.log('Starting postgres container...');
execSync(`docker compose -f '${composeFile}' start postgres`, { stdio: 'inherit' });

console.log('Restore complete.');