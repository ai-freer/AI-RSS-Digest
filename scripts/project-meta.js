const fs = require('fs');
const path = require('path');

function getPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch (_) {
    return '0.0.0';
  }
}

const VERSION = getPackageVersion();
const USER_AGENT = `RSS-Digest/${VERSION}`;

module.exports = {
  VERSION,
  USER_AGENT
};
