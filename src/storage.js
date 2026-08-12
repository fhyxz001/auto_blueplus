const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 所有持久化路径集中在此，扫描器与服务端共用同一份定义
const CWD = process.cwd();
const DATA_FILE = path.join(CWD, 'threads_analysis.json');
const SCANNED_CACHE_FILE = path.join(CWD, 'scanned_cache.json');
const HISTORY_DIR = path.join(CWD, 'history');
const TRIGGER_FILE = path.join(CWD, 'scan_trigger.json');
const AUTH_FILE = path.join(CWD, 'auth.json');

const HISTORY_KEEP = 100;

// 原子写入 JSON：先写临时文件再 rename，避免并发读取时读到半截内容
function writeJsonAtomic(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        logger.error(`⚠️ 读取 ${path.basename(file)} 失败:`, e.message);
    }
    return fallback;
}

// =========================================================
// 已扫描缓存管理
// =========================================================
function loadScannedCache() {
    const data = readJson(SCANNED_CACHE_FILE, { tids: [] });
    return new Set(data.tids || []);
}

function saveScannedCache(cache) {
    writeJsonAtomic(SCANNED_CACHE_FILE, {
        description: '已扫描过的帖子tid列表（所有已分析过的帖子），下次运行时会自动跳过',
        count: cache.size,
        tids: Array.from(cache).sort((a, b) => Number(a) - Number(b))
    });
}

// =========================================================
// 历史扫描记录存档：每次扫描结果写入 history/ 目录，保留最近 N 条
// =========================================================
function scanTimestampString(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function saveHistory(data) {
    try {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const file = `scan_${scanTimestampString(new Date())}.json`;
        writeJsonAtomic(path.join(HISTORY_DIR, file), data);

        // 只保留最近 HISTORY_KEEP 条，避免无限增长
        const files = fs.readdirSync(HISTORY_DIR)
            .filter((f) => /^scan_.*\.json$/.test(f))
            .sort();
        while (files.length > HISTORY_KEEP) {
            const oldest = files.shift();
            try { fs.unlinkSync(path.join(HISTORY_DIR, oldest)); } catch (e) {}
        }
        return file;
    } catch (e) {
        logger.error('⚠️ 保存历史记录失败:', e.message);
        return null;
    }
}

module.exports = {
    DATA_FILE,
    SCANNED_CACHE_FILE,
    HISTORY_DIR,
    TRIGGER_FILE,
    AUTH_FILE,
    HISTORY_KEEP,
    writeJsonAtomic,
    readJson,
    loadScannedCache,
    saveScannedCache,
    saveHistory,
    scanTimestampString
};
