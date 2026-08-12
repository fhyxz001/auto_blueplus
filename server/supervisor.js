// 扫描器子进程监督：崩溃后自动重启，带指数退避（最大 60s），
// 进程稳定运行 30s 后重置退避。避免一次配置错误导致的无限高频重启循环。
const { spawn } = require('child_process');

function startSupervisor(logger, scannerScript) {
    let child = null;
    let stopped = false;
    let restartDelay = 1000;

    function spawnScanner() {
        child = spawn(process.execPath, [scannerScript], { stdio: 'inherit' });

        // 稳定运行 30 秒则视为健康，重置退避
        const resetTimer = setTimeout(() => { restartDelay = 1000; }, 30000);

        child.on('exit', (code, signal) => {
            clearTimeout(resetTimer);
            if (stopped) return;
            logger.warn(`扫描器进程已退出 (code=${code}, signal=${signal})，${restartDelay / 1000} 秒后重启`);
            setTimeout(spawnScanner, restartDelay);
            restartDelay = Math.min(restartDelay * 2, 60000);
        });
    }

    spawnScanner();

    return {
        stop() {
            stopped = true;
            if (child) child.kill();
        }
    };
}

module.exports = { startSupervisor };
