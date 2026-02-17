const fs = require('fs');
const path = require('path');

function parseCliArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureValue(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required value: ${name}`);
  }
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeTextOutput(text, outFile) {
  if (!outFile) {
    process.stdout.write(text);
    if (!text.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text);
}

function writeJsonOutput(data, outFile) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeTextOutput(text, outFile);
}

module.exports = {
  parseCliArgs,
  ensureValue,
  readJsonFile,
  writeTextOutput,
  writeJsonOutput
};
