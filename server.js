const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');

const PORT = 3456;
const CWD = process.cwd();
const DIST_DIR = path.join(CWD, 'dist');
// 数据文件目录（输出/缓存/定时配置/auth.json），可用 SP_DATA_DIR 覆盖，便于 Docker 挂载卷
const DATA_DIR = process.env.SP_DATA_DIR || CWD;

let scanProcess = null;
let scanLog = [];
let scanStartTime = null;

// =========================================================
// 定时任务配置
// =========================================================
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const DEFAULT_SCHEDULE = {
    enabled: false,
    intervalMinutes: 180, // 默认 3 小时
    maxPage: 2,
    textThreshold: 300,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0
};

function loadSchedule() {
    const stored = readJSON(SCHEDULE_FILE);
    if (!stored) return { ...DEFAULT_SCHEDULE };
    return {
        ...DEFAULT_SCHEDULE,
        ...stored,
        intervalMinutes: Math.max(30, Number(stored.intervalMinutes) || DEFAULT_SCHEDULE.intervalMinutes),
        maxPage: Number(stored.maxPage) || DEFAULT_SCHEDULE.maxPage,
        textThreshold: Number(stored.textThreshold) || DEFAULT_SCHEDULE.textThreshold,
        runCount: Number(stored.runCount) || 0
    };
}

function saveSchedule() {
    writeJSON(SCHEDULE_FILE, schedule);
}

let schedule = loadSchedule();

// =========================================================
// MIME types
// =========================================================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.map': 'application/json'
};

function serveFile(res, filepath, contentType) {
    try {
        const data = fs.readFileSync(filepath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    } catch (e) {
        res.writeHead(404);
        res.end('Not found');
    }
}

// =========================================================
// JSON helpers
// =========================================================
function readJSON(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function writeJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// =========================================================
// API handlers
// =========================================================
function apiData(res) {
    const analysis = readJSON(path.join(DATA_DIR, 'threads_analysis.json')) || {
        summary: { longTextCount: 0, paywallCount: 0, gofileCount: 0, skippedByCache: 0, newlyScanned: 0, cachedTotal: 0 },
        longTextPosts: [], paywallPosts: [], gofilePosts: []
    };
    const scannedCache = readJSON(path.join(DATA_DIR, 'scanned_cache.json')) || { count: 0, tids: [] };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ analysis, scannedCache }));
}

function launchScan(maxPage, textThreshold, note) {
    scanLog = [];
    scanStartTime = Date.now();
    if (note) {
        scanLog.push({ time: new Date().toISOString(), text: note });
    }

    const env = {
        ...process.env,
        SP_MAX_PAGE: String(maxPage),
        SP_TEXT_THRESHOLD: String(textThreshold),
        SP_DASHBOARD: '1'
    };

    // southplus.js 与 server.js 同目录（Docker 中在 /app），
    // 用绝对路径传给 node；cwd 仍为数据目录，保证脚本内 process.cwd() 指向挂载卷
    scanProcess = spawn('node', [path.join(__dirname, 'southplus.js')], { cwd: DATA_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });

    scanProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
            scanLog.push({ time: new Date().toISOString(), text: line });
            if (scanLog.length > 500) scanLog.shift();
        }
    });

    scanProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
            scanLog.push({ time: new Date().toISOString(), text: '[ERR] ' + line });
            if (scanLog.length > 500) scanLog.shift();
        }
    });

    scanProcess.on('close', (code) => {
        scanLog.push({ time: new Date().toISOString(), text: `扫描进程结束，退出码: ${code}` });
        scanProcess = null;
        scanStartTime = null;
    });

    return scanProcess;
}

function apiScan(req, res) {
    if (scanProcess) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '扫描已在运行中' }));
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        let params = {};
        try { params = JSON.parse(body); } catch (e) {}

        const maxPage = parseInt(params.maxPage) || 2;
        const textThreshold = parseInt(params.textThreshold) || 300;

        const proc = launchScan(maxPage, textThreshold, null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pid: proc.pid }));
    });
}

function apiScanStatus(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        running: !!scanProcess,
        pid: scanProcess ? scanProcess.pid : null,
        elapsed: scanStartTime ? Math.floor((Date.now() - scanStartTime) / 1000) : 0,
        log: scanLog.slice(-50)
    }));
}

function apiStopScan(res) {
    if (!scanProcess) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '没有正在运行的扫描' }));
        return;
    }
    scanProcess.kill('SIGTERM');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
}

function apiClearCache(res) {
    const cacheFile = path.join(DATA_DIR, 'scanned_cache.json');
    writeJSON(cacheFile, { description: '已扫描过的帖子tid列表', count: 0, tids: [] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
}

function apiDeleteCacheTid(req, res) {
    const tid = req.url.split('/').pop();
    const cacheFile = path.join(DATA_DIR, 'scanned_cache.json');
    const cache = readJSON(cacheFile) || { tids: [] };
    cache.tids = cache.tids.filter(t => t !== tid);
    cache.count = cache.tids.length;
    writeJSON(cacheFile, cache);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
}

// =========================================================
// 定时任务 API
// =========================================================
function apiGetSchedule(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(schedule));
}

function apiSetSchedule(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        let params = {};
        try { params = JSON.parse(body); } catch (e) {}

        if (typeof params.enabled === 'boolean') schedule.enabled = params.enabled;

        if (params.intervalMinutes != null) {
            schedule.intervalMinutes = Math.min(720 * 60, Math.max(30, Math.round(Number(params.intervalMinutes))));
        }
        if (params.maxPage != null) {
            schedule.maxPage = Math.min(50, Math.max(1, Math.round(Number(params.maxPage))));
        }
        if (params.textThreshold != null) {
            schedule.textThreshold = Math.min(5000, Math.max(50, Math.round(Number(params.textThreshold))));
        }

        if (schedule.enabled) {
            schedule.nextRunAt = new Date(Date.now() + schedule.intervalMinutes * 60000).toISOString();
        } else {
            schedule.nextRunAt = null;
        }

        saveSchedule();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(schedule));
    });
}

function maybeRunScheduledScan() {
    if (!schedule.enabled || scanProcess || !schedule.nextRunAt) return;
    const now = Date.now();
    if (now >= new Date(schedule.nextRunAt).getTime()) {
        schedule.lastRunAt = new Date(now).toISOString();
        schedule.nextRunAt = new Date(now + schedule.intervalMinutes * 60000).toISOString();
        schedule.runCount = (schedule.runCount || 0) + 1;
        saveSchedule();
        launchScan(schedule.maxPage, schedule.textThreshold, '⏰ 定时任务触发，自动扫描开始');
    }
}

setInterval(maybeRunScheduledScan, 15000);

// =========================================================
// Static serving of built Vue app (dist/)
// =========================================================
function serveStatic(res, filepath) {
    const resolved = path.normalize(path.join(DIST_DIR, filepath));
    if (!resolved.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    let target = resolved;
    try {
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
            target = path.join(DIST_DIR, 'index.html');
        }
    } catch (e) {
        target = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(target).toLowerCase();
    serveFile(res, target, MIME_TYPES[ext] || 'application/octet-stream');
}

// =========================================================
// Server
// =========================================================
const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const p = parsed.pathname;
        if (p === '/api/data' && req.method === 'GET') {
            apiData(res);
        } else if (p === '/api/scan' && req.method === 'POST') {
            apiScan(req, res);
        } else if (p === '/api/scan-status' && req.method === 'GET') {
            apiScanStatus(res);
        } else if (p === '/api/stop-scan' && req.method === 'POST') {
            apiStopScan(res);
        } else if (p === '/api/clear-cache' && req.method === 'POST') {
            apiClearCache(res);
        } else if (p === '/api/schedule' && req.method === 'GET') {
            apiGetSchedule(res);
        } else if (p === '/api/schedule' && req.method === 'POST') {
            apiSetSchedule(req, res);
        } else if (p.startsWith('/api/cache/') && req.method === 'DELETE') {
            apiDeleteCacheTid(req, res);
        } else if (p.startsWith('/api/')) {
            res.writeHead(404);
            res.end('Not found');
        } else if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
            serveStatic(res, p === '/' ? '/index.html' : p);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('前端尚未构建。请运行: npm run dev（开发模式）或 npm run build（构建后访问本端口）');
        }
    } catch (e) {
        console.error('Server error:', e);
        res.writeHead(500);
        res.end('Internal error');
    }
});

server.listen(PORT, () => {
    console.log(`南+ 扫描控制台已启动: http://localhost:${PORT}`);
});
