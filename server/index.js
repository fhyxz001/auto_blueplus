const http = require('http');
const path = require('path');
const logger = require('../src/logger');
const { createHandler } = require('./routes');
const { startSupervisor } = require('./supervisor');

const PORT = parseInt(process.env.PORT, 10) || 4567;
const SCANNER_SCRIPT = path.join(process.cwd(), 'southplus.js');

// 启动扫描器子进程（带崩溃重启监督）
startSupervisor(logger, SCANNER_SCRIPT);

const server = http.createServer(createHandler());

server.listen(PORT, () => {
    logger.log('================================');
    logger.log(' 南+ 扫描控制台已启动');
    logger.log(` 网页: http://localhost:${PORT}`);
    logger.log(' 扫描需在网页点击"立即扫描"手动触发');
    logger.log('================================');
});
