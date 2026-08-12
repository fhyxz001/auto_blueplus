const fs = require('fs');
const path = require('path');

// ---------- Static 文件白名单 ----------
const STATIC = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/vue.global.prod.js': 'vue.global.prod.js',
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

function sendRawJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
}

function readBody(req, cb) {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) { // 1MB 上限，防止恶意/异常请求撑爆内存
            req.destroy();
            return;
        }
        body += chunk;
    });
    req.on('end', () => cb(body));
}

// 静态文件服务：命中白名单返回 true 并异步响应，未命中返回 false
function serveStatic(res, pathname) {
    const filename = STATIC[pathname];
    if (!filename) return false;
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
    return true;
}

module.exports = { STATIC, MIME, sendJson, sendRawJson, readBody, serveStatic };
