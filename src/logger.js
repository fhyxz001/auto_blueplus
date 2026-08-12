const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

let fileStream = null;

function ensureStream() {
    if (fileStream) return fileStream;
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fileStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    } catch (e) {
        fileStream = null;
    }
    return fileStream;
}

function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function format(arg) {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    return JSON.stringify(arg);
}

function write(level, args) {
    const line = `[${timestamp()}] [${level}] ${args.map(format).join(' ')}`;
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);

    const s = ensureStream();
    if (s) s.write(line + '\n');
}

module.exports = {
    log: (...a) => write('INFO', a),
    warn: (...a) => write('WARN', a),
    error: (...a) => write('ERROR', a),
};
