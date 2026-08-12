const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const storage = require('../src/storage');
const { sendJson, sendRawJson, readBody, serveStatic } = require('./static');
const { getHistoryData } = require('./history');

const PORT = parseInt(process.env.PORT, 10) || 4567;

function createHandler() {
    return (req, res) => {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pathname = url.pathname;

        // ---- 当前最新结果 ----
        if (pathname === '/api/data' && req.method === 'GET') {
            if (!fs.existsSync(storage.DATA_FILE)) {
                sendJson(res, 404, { error: 'not_found' });
                return;
            }
            try {
                sendRawJson(res, 200, fs.readFileSync(storage.DATA_FILE, 'utf8'));
            } catch (e) {
                sendJson(res, 500, { error: e.message });
            }
            return;
        }

        // ---- 设置 ----
        if (pathname === '/api/settings' && req.method === 'GET') {
            sendJson(res, 200, config.loadSettings());
            return;
        }

        if (pathname === '/api/settings' && req.method === 'POST') {
            readBody(req, (body) => {
                try {
                    const parsed = JSON.parse(body);
                    const saved = config.saveSettings(parsed);
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
                fs.writeFileSync(storage.TRIGGER_FILE, JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2), 'utf8');
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
                const fp = path.join(storage.HISTORY_DIR, file);
                if (!fs.existsSync(fp)) {
                    sendJson(res, 404, { error: 'not_found' });
                    return;
                }
                try {
                    sendRawJson(res, 200, fs.readFileSync(fp, 'utf8'));
                } catch (e) {
                    sendJson(res, 500, { error: e.message });
                }
                return;
            }
            sendJson(res, 200, getHistoryData().list);
            return;
        }

        // ---- 历史合并查询：所有历史记录按 tid 合并去重后的完整数据 ----
        if (pathname === '/api/merged' && req.method === 'GET') {
            const merged = getHistoryData().merged;
            if (!merged) {
                sendJson(res, 404, { error: 'no_history' });
                return;
            }
            sendJson(res, 200, merged);
            return;
        }

        // ---- 静态文件 ----
        if (serveStatic(res, pathname)) return;

        // 404
        sendJson(res, 404, { error: 'not_found' });
    };
}

module.exports = { createHandler };
