const { execSync }           = require('child_process');
const fs                     = require('fs');
const path                   = require('path');
const { findPostgresVolume } = require('./lib');

const prefix = process.argv[2] || '';


const root = path.resolve(__dirname, '..');
const backupsDir = path.join(root, 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

const ts       = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `${prefix ? prefix + '_' : ''}postgres_backup_${ts}.tar.gz`;
const outPath  = path.join(backupsDir, filename);

console.log('Creating backup:', filename);

let volumeName;
try {
    volumeName = findPostgresVolume();
    console.log('Using docker volume:', volumeName);
} catch (err) {
    console.error(err);
    process.exit(1);
}

// use docker run to mount volume and create tarball
const shellScript = [
  `set -e`,
  `echo 'Creating backup...'`,
  `tar -czf /backup/${filename} -C /data .`,
  `echo 'backup created:'`,
  `ls -lh /backup/${filename}`
].join(' && ');
const cmd = `docker run --rm -v "${volumeName}:/data:ro" -v "${backupsDir}:/backup" alpine:3.18 sh -c "${shellScript}"`;

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (err) {
  console.error('docker run failed:', err + "");
  process.exit(1);
}

try {
  const stats = fs.statSync(outPath);
  if (!stats.size) {
    console.error('Backup created but archive is empty:', outPath);
    process.exit(1);
  }
} catch (err) {
  console.error('Backup failed, archive not found:', outPath);
  process.exit(1);
}

console.log('Backup saved to', outPath);
