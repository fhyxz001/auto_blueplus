const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadSettings, saveSettings } = require('./settings');

const PORT = parseInt(process.env.PORT, 10) || 4567;
const DATA_FILE = path.join(process.cwd(), 'threads_analysis.json');
const SCANNER_SCRIPT = path.join(process.cwd(), 'southplus.js');
const TRIGGER_FILE = path.join(process.cwd(), 'scan_trigger.json');
const HISTORY_DIR = path.join(process.cwd(), 'history');

// ---------- 启动扫描器子进程 ----------
const scanner = spawn(process.execPath, [SCANNER_SCRIPT], { stdio: 'inherit' });
scanner.on('exit', (code) => {
    console.log(`扫描器进程已退出 (code=${code})`);
});

// ---------- Static 文件白名单 ----------
const STATIC = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/vue.global.prod.js': 'vue.global.prod.js',
    '/viewer.html': 'viewer.html',
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, obj) {
    const data = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
}

function readBody(req, cb) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => cb(body));
}

// 列出历史扫描记录（最新在前），每条附带 summary 供前端下拉展示
function listHistory() {
    try {
        if (!fs.existsSync(HISTORY_DIR)) return [];
        const files = fs.readdirSync(HISTORY_DIR)
            .filter((f) => /^scan_.*\.json$/.test(f))
            .sort();
        const items = [];
        for (const f of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
                items.push({ file: f, scannedAt: data.scannedAt || null, summary: data.summary || {} });
            } catch (e) {}
        }
        return items.reverse();
    } catch (e) {
        return [];
    }
}

// ---------- 历史扫描记录合并 ----------
// 将所有历史扫描记录按 tid 合并去重，字段取各记录中最全的信息：
// 缺失/空值用其他记录补全，charCount 取最大，gofile 链接取并集，付费状态优先非 none。
// 由于每次扫描只记录新增帖子（缓存跳过已扫描过的），合并后可还原完整帖子集合。
function mergeHistory() {
    try {
        const records = [];

        // 当前最新结果作为第一优先级记录（正常情况下与最新历史文件内容一致）
        if (fs.existsSync(DATA_FILE)) {
            try { records.push(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) {}
        }

        // 历史扫描记录，最新在前
        if (fs.existsSync(HISTORY_DIR)) {
            const files = fs.readdirSync(HISTORY_DIR)
                .filter((f) => /^scan_.*\.json$/.test(f))
                .sort()
                .reverse();
            for (const f of files) {
                try { records.push(JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'))); } catch (e) {}
            }
        }

        if (records.length === 0) return null;

        const longMap = new Map();
        const paywallMap = new Map();
        const gofileMap = new Map();
        let latestAt = null;
        let totalPages = 0;

        // 按 tid 合并单条记录：先出现的（更新）记录为基准，用后出现的补全缺失字段
        const mergeInto = (map, post) => {
            if (!post || !post.tid) return;
            if (!map.has(post.tid)) { map.set(post.tid, { ...post }); return; }
            const cur = map.get(post.tid);
            for (const k of Object.keys(post)) {
                const nv = post[k];
                const cv = cur[k];
                if (Array.isArray(nv)) {
                    cur[k] = Array.from(new Set([...(cv || []), ...nv]));
                } else if (k === 'charCount') {
                    if (Number(nv) > Number(cv || 0)) cur[k] = nv;
                } else if (k === 'paywallStatus') {
                    if ((!cv || cv === 'none') && nv) cur[k] = nv;
                } else if ((cv == null || cv === '' || cv === -1) && nv != null && nv !== '') {
                    cur[k] = nv;
                }
            }
        };

        for (const rec of records) {
            if (rec.scannedAt && (!latestAt || rec.scannedAt > latestAt)) latestAt = rec.scannedAt;
            totalPages = Math.max(totalPages, rec.totalPages || 0);
            for (const p of rec.longTextPosts || []) mergeInto(longMap, p);
            for (const p of rec.paywallPosts || []) mergeInto(paywallMap, p);
            for (const p of rec.gofilePosts || []) mergeInto(gofileMap, p);
        }

        return {
            description: '南+帖子分析结果（历史合并）',
            scannedAt: latestAt,
            totalPages,
            merged: true,
            mergedFiles: records.length,
            summary: {
                longTextCount: longMap.size,
                paywallCount: paywallMap.size,
                gofileCount: gofileMap.size
            },
            longTextPosts: Array.from(longMap.values()),
            paywallPosts: Array.from(paywallMap.values()),
            gofilePosts: Array.from(gofileMap.values())
        };
    } catch (e) {
        return null;
    }
}

// ---------- 路由 ----------
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // ---- API ----
    if (pathname === '/api/data' && req.method === 'GET') {
        if (!fs.existsSync(DATA_FILE)) {
            sendJson(res, 404, { error: 'not_found' });
            return;
        }
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(data),
            });
            res.end(data);
        } catch (e) {
            sendJson(res, 500, { error: e.message });
        }
        return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
        sendJson(res, 200, loadSettings());
        return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
        readBody(req, (body) => {
            try {
                const parsed = JSON.parse(body);
                const saved = saveSettings(parsed);
                sendJson(res, 200, saved);
            } catch (e) {
                sendJson(res, 400, { error: '设置解析失败: ' + e.message });
            }
        });
        return;
    }

    // ---- 手动触发扫描：写入触发文件，扫描器在等待期间检测到即开始新一轮 ----
    if (pathname === '/api/scan' && req.method === 'POST') {
        try {
            fs.writeFileSync(TRIGGER_FILE, JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2), 'utf8');
            sendJson(res, 200, { ok: true, message: '已请求开启一轮扫描' });
        } catch (e) {
            sendJson(res, 500, { error: '写入触发失败: ' + e.message });
        }
        return;
    }

    // ---- 历史记录查询 ----
    if (pathname === '/api/history' && req.method === 'GET') {
        const file = url.searchParams.get('file');
        if (file) {
            // 防路径穿越：只允许字母数字_.-组成的.json文件名
            if (!/^[A-Za-z0-9_.-]+$/.test(file) || !file.endsWith('.json')) {
                sendJson(res, 400, { error: '非法文件名' });
                return;
            }
            const fp = path.join(HISTORY_DIR, file);
            if (!fs.existsSync(fp)) {
                sendJson(res, 404, { error: 'not_found' });
                return;
            }
            try {
                const data = fs.readFileSync(fp, 'utf8');
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(data),
                });
                res.end(data);
            } catch (e) {
                sendJson(res, 500, { error: e.message });
            }
            return;
        }
        sendJson(res, 200, listHistory());
        return;
    }

    // ---- 历史合并查询：所有历史记录按 tid 合并去重后的完整数据 ----
    if (pathname === '/api/merged' && req.method === 'GET') {
        const merged = mergeHistory();
        if (!merged) {
            sendJson(res, 404, { error: 'no_history' });
            return;
        }
        sendJson(res, 200, merged);
        return;
    }

    // ---- 静态文件 ----
    const filename = STATIC[pathname];
    if (filename) {
        const filePath = path.join(process.cwd(), filename);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                sendJson(res, 500, { error: '读取文件失败' });
                return;
            }
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
        return;
    }

    // 404
    sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
    console.log('================================');
    console.log(' 南+ 扫描控制台已启动');
    console.log(` 网页: http://localhost:${PORT}`);
    console.log(' 扫描需在网页点击"立即扫描"手动触发');
    console.log('================================');
});