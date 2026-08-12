const fs = require('fs');
const path = require('path');
const storage = require('../src/storage');
const { mergeRecords } = require('../src/forum/merge');

// 读取所有历史记录对象（最新在前）：当前结果 + history/ 目录下所有扫描文件
function readHistoryRecords() {
    const records = [];
    if (fs.existsSync(storage.DATA_FILE)) {
        try { records.push(JSON.parse(fs.readFileSync(storage.DATA_FILE, 'utf8'))); } catch (e) {}
    }
    if (fs.existsSync(storage.HISTORY_DIR)) {
        const files = fs.readdirSync(storage.HISTORY_DIR)
            .filter((f) => /^scan_.*\.json$/.test(f))
            .sort()
            .reverse();
        for (const f of files) {
            try { records.push(JSON.parse(fs.readFileSync(path.join(storage.HISTORY_DIR, f), 'utf8'))); } catch (e) {}
        }
    }
    return records;
}

// 列出历史扫描记录（最新在前），每条附带 summary 供前端下拉展示
function listHistory() {
    try {
        if (!fs.existsSync(storage.HISTORY_DIR)) return [];
        const files = fs.readdirSync(storage.HISTORY_DIR)
            .filter((f) => /^scan_.*\.json$/.test(f))
            .sort();
        const items = [];
        for (const f of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(storage.HISTORY_DIR, f), 'utf8'));
                items.push({ file: f, scannedAt: data.scannedAt || null, summary: data.summary || {} });
            } catch (e) {}
        }
        return items.reverse();
    } catch (e) {
        return [];
    }
}

// 历史合并：所有记录按 tid 合并去重后的完整数据
function mergeHistory() {
    try {
        return mergeRecords(readHistoryRecords());
    } catch (e) {
        return null;
    }
}

// ---------- 历史数据缓存 ----------
// 只有在历史文件变化时才重新解析，避免每次请求都把最多 100 个 JSON 全量读+解析。
// 签名基于文件集合的 mtime/size，扫描器每轮结束后才写新文件，因此缓存会在扫描完成时自然失效。
let histCache = null; // { sig, list, merged }

function historySignature() {
    const parts = [];
    const stat = (p) => {
        try {
            const st = fs.statSync(p);
            return `${p}:${st.mtimeMs}:${st.size}`;
        } catch (e) {
            return `${p}:missing`;
        }
    };
    parts.push(stat(storage.DATA_FILE));
    if (fs.existsSync(storage.HISTORY_DIR)) {
        const files = fs.readdirSync(storage.HISTORY_DIR)
            .filter((f) => /^scan_.*\.json$/.test(f))
            .sort();
        for (const f of files) parts.push(stat(path.join(storage.HISTORY_DIR, f)));
    }
    return parts.join('|');
}

function getHistoryData() {
    const sig = historySignature();
    if (!histCache || histCache.sig !== sig) {
        histCache = {
            sig,
            list: listHistory(),
            merged: mergeHistory()
        };
    }
    return histCache;
}

module.exports = { readHistoryRecords, listHistory, mergeHistory, historySignature, getHistoryData };
