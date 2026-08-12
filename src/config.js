const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');

const DEFAULTS = {
    scanIntervalMinutes: 60,  // 扫描间隔（分钟）
    maxPage: 2,               // 采集页数
    textThreshold: 300,       // 长文阈值（字）
    proxyServer: '',          // 形如 http://host:port 或 socks5://host:port
    proxyUsername: '',
    proxyPassword: ''
};

function loadSettings() {
    const s = { ...DEFAULTS };
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            Object.assign(s, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
        }
    } catch (e) {
        logger.error('⚠️ 读取 settings.json 失败，使用默认值:', e.message);
    }

    // 环境变量优先覆盖（兼容旧的 SP_* 变量）
    if (process.env.SP_INTERVAL_MS) {
        const ms = parseInt(process.env.SP_INTERVAL_MS, 10);
        if (Number.isFinite(ms) && ms > 0) s.scanIntervalMinutes = Math.round(ms / 60000);
    }
    if (process.env.SP_MAX_PAGE) {
        const n = parseInt(process.env.SP_MAX_PAGE, 10);
        if (Number.isFinite(n) && n > 0) s.maxPage = n;
    }
    if (process.env.SP_TEXT_THRESHOLD) {
        const n = parseInt(process.env.SP_TEXT_THRESHOLD, 10);
        if (Number.isFinite(n) && n > 0) s.textThreshold = n;
    }
    if (process.env.SP_PROXY) s.proxyServer = process.env.SP_PROXY;
    if (process.env.SP_PROXY_USERNAME) s.proxyUsername = process.env.SP_PROXY_USERNAME;
    if (process.env.SP_PROXY_PASSWORD) s.proxyPassword = process.env.SP_PROXY_PASSWORD;

    // 数字字段兜底
    s.scanIntervalMinutes = Number(s.scanIntervalMinutes) || DEFAULTS.scanIntervalMinutes;
    s.maxPage = Number(s.maxPage) || DEFAULTS.maxPage;
    s.textThreshold = Number(s.textThreshold) || DEFAULTS.textThreshold;

    return s;
}

function saveSettings(s) {
    const merged = { ...DEFAULTS, ...(s || {}) };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

module.exports = { DEFAULTS, loadSettings, saveSettings };
