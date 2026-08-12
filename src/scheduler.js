const fs = require('fs');
const logger = require('./logger');
const config = require('./config');
const storage = require('./storage');
const { runScan } = require('./scanner');

// 手动触发：检测触发文件是否存在，存在则消费并返回 true
function consumeTrigger() {
    try {
        if (fs.existsSync(storage.TRIGGER_FILE)) {
            fs.unlinkSync(storage.TRIGGER_FILE);
            return true;
        }
    } catch (e) {
        logger.error('⚠️ 读取触发文件失败:', e.message);
    }
    return false;
}

// 调度：启动后不自动扫描，等待网页手动触发。首次触发后立即扫描一次，
// 并同时开启定时扫描（每 settings.scanIntervalMinutes 分钟自动一次）。
// 定时扫描期间仍可手动触发，手动触发会立即开始并重置定时。
function startScheduler() {
    logger.log('⏳ 扫描器已就绪：等待网页手动触发，触发后开启定时扫描');
    logger.log(`   可在网页 http://localhost:${process.env.PORT || 4567} 点击"立即扫描"按钮开始一轮扫描`);

    let timerEnabled = false; // 是否已开启定时扫描
    let nextTimerAt = 0;      // 下一次定时扫描的到期时间

    async function doScan(reason) {
        logger.log('\n================================');
        logger.log(reason);
        logger.log('================================');
        const startedAt = Date.now();
        try {
            await runScan();
        } catch (e) {
            logger.error('❌ 扫描过程异常:', e.message);
        }
        const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
        logger.log(`⏱️ 本次扫描耗时 ${elapsedMin} 分钟`);
        if (timerEnabled) {
            const settings = config.loadSettings();
            const intervalMs = settings.scanIntervalMinutes * 60000;
            nextTimerAt = Date.now() + intervalMs;
            logger.log(`🕐 定时扫描已开启：每 ${settings.scanIntervalMinutes} 分钟自动扫描一次，下次 ${new Date(nextTimerAt).toLocaleString()}`);
        }
    }

    (async () => {
        for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 手动触发优先
            if (consumeTrigger()) {
                if (!timerEnabled) {
                    timerEnabled = true;
                    const settings = config.loadSettings();
                    logger.log(`🕐 已开启定时扫描：每 ${settings.scanIntervalMinutes} 分钟自动扫描一次`);
                }
                await doScan('🖱️ 收到手动触发：开始扫描');
                continue;
            }

            // 定时到期
            if (timerEnabled && Date.now() >= nextTimerAt) {
                await doScan('🕐 定时任务触发：开始自动扫描');
            }
        }
    })();
}

module.exports = { startScheduler, consumeTrigger };
