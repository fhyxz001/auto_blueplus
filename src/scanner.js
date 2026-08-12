const { chromium } = require('playwright');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const storage = require('./storage');
const { SELECTORS, BASE_URL, pageUrl } = require('./forum/selectors');
const { extractTid, parsePrice, countChars } = require('./forum/extract');
const { classifyPost } = require('./forum/classify');
const reader = require('./forum/reader');

// 尝试 0 SP 购买（如果售价为 0 就点击购买按钮）
async function tryZeroSpPurchase(page) {
    try {
        const hasPaywall = await reader.hasPaywall(page);
        if (!hasPaywall) return 'no_paywall';

        const price = parsePrice(await reader.readPriceText(page));
        logger.log(`   💲 售价: ${price === -1 ? '未知' : price + ' SP币'}`);

        // 收集按钮信息用于诊断
        const allButtons = page.locator(SELECTORS.buyButton);
        const buttonCount = await allButtons.count();
        const buttonValues = [];
        for (let i = 0; i < buttonCount; i++) {
            const val = await allButtons.nth(i).getAttribute('value');
            if (val) buttonValues.push(val);
        }
        logger.log(`   🔘 付费框按钮: [${buttonValues.join(', ')}]`);

        if (price === 0) {
            logger.log('   🆓 售价为 0 SP币，免费领取...');
            await page.locator(SELECTORS.buyButton).first().click();
            logger.log('   ✅ 已点击购买按钮');
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            logger.log('   🔄 页面已刷新');
            return 'free_clicked';
        }

        // 兼容旧格式：value="免费"
        const freeButton = page.locator(SELECTORS.freeButtonOld);
        if (await freeButton.count() > 0) {
            logger.log('   🆓 找到"免费"按钮（旧格式），准备点击...');
            await freeButton.first().click();
            logger.log('   ✅ 已点击"免费"按钮');
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            logger.log('   🔄 页面已刷新');
            return 'free_clicked';
        }

        return 'paid_only';
    } catch (error) {
        logger.error(`   ❌ 购买处理出错: ${error.message}`);
        return 'error';
    }
}

async function runScan() {
    // 每次扫描重新读取设置（settings.json + 环境变量覆盖），改设置无需重启
    const settings = config.loadSettings();

    // 代理配置：settings.proxyServer 形如 http://host:port 或 socks5://host:port，
    // 未设置则不走代理。
    const proxyOpts = (() => {
        if (!settings.proxyServer) return {};
        const p = { server: settings.proxyServer };
        if (settings.proxyUsername) p.username = settings.proxyUsername;
        if (settings.proxyPassword) p.password = settings.proxyPassword;
        return { proxy: p };
    })();

    // 非无头运行：真实浏览器 + 真实 UA 才能维持 auth.json 登录会话。
    // 窗口默认最小化并移出屏幕，不弹出干扰桌面。
    const chromeArgs = ['--start-minimized', '--window-position=-32000,-32000'];
    if (process.env.SP_NO_SANDBOX === '1') chromeArgs.push('--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu');

    const browser = await chromium.launch({
        headless: false,
        ...proxyOpts,
        args: chromeArgs
    });

    // 会话与 UA 绑定：auth.json 是带头模式下捕获的，其 UA 为 "Chrome/主版本.0.0.0"。
    // 显式声明与带头模式一致的 UA，即使以后切回无头模式登录也有效
    const realUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${parseInt(await browser.version())}.0.0.0 Safari/537.36`;

    const context = await browser.newContext({
        storageState: storage.AUTH_FILE,
        userAgent: realUA
    });

    const page = await context.newPage();

    // 最小化浏览器窗口（从屏幕外启动避免闪烁，再通过 CDP 真正最小化；失败不影响扫描）
    try {
        const pageSession = await context.newCDPSession(page);
        const { targetInfo } = await pageSession.send('Target.getTargetInfo');
        const cdp = await browser.newBrowserCDPSession();
        const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } catch (e) {
        logger.log('⚠️ 浏览器窗口最小化失败（不影响扫描）:', e.message);
    }

    const MAX_PAGE = settings.maxPage;
    const LONG_TEXT_THRESHOLD = settings.textThreshold; // 大于该字数算长文帖

    // 结果分类存储
    const longTextPosts = [];    // 长文帖
    const paywallPosts = [];     // 付费帖（有购买组件）
    const gofilePosts = [];      // 主楼含 gofile 链接的帖子

    // 已扫描缓存（所有已分析过的帖子tid，下次跳过）
    const scannedCache = storage.loadScannedCache();
    logger.log(`📋 已扫描缓存: ${scannedCache.size} 条记录`);
    let skippedCount = 0;
    let newScannedCount = 0;

    try {
        logger.log('正在打开论坛...');

        // =====================================================
        // 循环采集分页
        // =====================================================
        for (let pageNum = 1; pageNum <= MAX_PAGE; pageNum++) {

            const url = pageUrl(pageNum);
            logger.log('\n================================');
            logger.log(`正在采集第 ${pageNum} 页`);
            logger.log(url);
            logger.log('================================');

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForTimeout(3000);

            // 第 1 页检查登录
            if (pageNum === 1) {
                const isLoggedIn = await page.locator('text=' + SELECTORS.logoutText).count() > 0;
                if (isLoggedIn) {
                    logger.log('✅ auth.json 生效！目前处于登录状态。');
                } else {
                    logger.log('⚠️ 没有检测到"退出"按钮，请检查是否登录成功。');
                }
            }

            // 获取帖子列表
            let rows;
            if (pageNum === 1) {
                logger.log('📌 第 1 页：寻找"普通主题"分隔线');
                const normalTopicRow = page.locator(SELECTORS.normalTopicDivider).filter({
                    hasText: '普通主题'
                }).first();

                if (await normalTopicRow.count() === 0) {
                    logger.log('❌ 第 1 页没有找到"普通主题"分隔线');
                    break;
                }
                logger.log('✅ 找到"普通主题"分隔线');
                rows = normalTopicRow.locator(SELECTORS.normalTopicRows);
            } else {
                logger.log(`📌 第 ${pageNum} 页：直接遍历所有普通帖子`);
                rows = page.locator(SELECTORS.pageRows);
            }

            const rowCount = await rows.count();
            logger.log(`第 ${pageNum} 页发现 ${rowCount} 个帖子`);
            if (rowCount === 0) continue;

            let pageThreadCount = 0;
            const pageThreads = [];

            for (let i = 0; i < rowCount; i++) {
                const row = rows.nth(i);

                const link = row.locator(SELECTORS.rowTitleLink).first();
                if (await link.count() === 0) continue;

                const title = (await link.innerText()).trim();
                if (title.includes('公告')) {
                    logger.log(`⏭️ 跳过公告：${title}`);
                    continue;
                }

                const href = await link.getAttribute('href');
                if (!href) continue;

                const fullUrl = new URL(href, BASE_URL).href;
                const tid = extractTid(fullUrl);

                pageThreads.push({ title, href, url: fullUrl, page: pageNum, tid });
                pageThreadCount++;
                logger.log(`[第 ${pageNum} 页 #${pageThreadCount}] ${title}`);
                logger.log(`    ${fullUrl}`);
            }

            logger.log(`✅ 第 ${pageNum} 页列表采集完成，共 ${pageThreadCount} 个帖子`);

            // =====================================================
            // 逐个打开详情页分析
            // =====================================================
            logger.log(`\n📋 开始分析第 ${pageNum} 页的详情页...`);

            for (let i = 0; i < pageThreads.length; i++) {
                const thread = pageThreads[i];
                logger.log(`\n[${pageNum}页 ${i + 1}/${pageThreads.length}] ${thread.title}`);
                logger.log(`   TID: ${thread.tid}`);

                try {
                    // 检查缓存：已扫描过的帖子跳过
                    if (thread.tid && scannedCache.has(thread.tid)) {
                        logger.log(`   ⏭️ 缓存记录：该帖子已扫描过，跳过`);
                        skippedCount++;
                        continue;
                    }

                    await page.goto(thread.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    await page.waitForTimeout(2000);

                    // 获取详情页标题
                    const detailTitle = await reader.readDetailTitle(page);
                    if (detailTitle) thread.title = detailTitle;

                    // -------- 检测付费框 + 0SP购买 --------
                    const initialHasPaywall = await reader.hasPaywall(page);
                    const price = initialHasPaywall ? parsePrice(await reader.readPriceText(page)) : -1;

                    logger.log(`   🔍 付费框: ${initialHasPaywall ? '有 (售价: ' + (price === -1 ? '未知' : price + ' SP') + ')' : '无'}`);

                    // 如果是0SP或免费，先点击让内容展示出来
                    let paywallStatus = initialHasPaywall ? 'paid' : 'none';
                    if (initialHasPaywall) {
                        const result = await tryZeroSpPurchase(page);
                        if (result === 'free_clicked') {
                            paywallStatus = 'free_purchased';
                        } else if (result === 'paid_only') {
                            paywallStatus = 'paid_only';
                        }
                    }

                    // -------- 提取主楼正文 + 字数统计 --------
                    const charCount = countChars(await reader.readMainContentText(page));
                    const isLongText = charCount > LONG_TEXT_THRESHOLD;
                    logger.log(`   📝 主楼文字数: ${charCount} ${isLongText ? '🔥 长文帖' : ''}`);

                    // -------- 提取 gofile 链接 --------
                    const gofileLinks = await reader.readGofileLinks(page);

                    // -------- 分类记录 --------
                    const classified = classifyPost({
                        tid: thread.tid,
                        title: thread.title,
                        url: thread.url,
                        page: thread.page,
                        charCount,
                        isLongText,
                        hasPaywall: initialHasPaywall,
                        price,
                        paywallStatus,
                        gofileLinks
                    });
                    if (classified.longText) longTextPosts.push(classified.longText);
                    if (classified.paywall) paywallPosts.push(classified.paywall);
                    if (classified.gofile) gofilePosts.push(classified.gofile);

                    // 所有成功分析的帖子都记录 tid 到缓存，下次跳过（避免重复扫描）
                    if (thread.tid) {
                        scannedCache.add(thread.tid);
                        newScannedCount++;
                        logger.log(`   💾 已加入扫描缓存 (tid=${thread.tid})`);
                    }

                    const tagStr = classified.tags.length > 0 ? ` [${classified.tags.join(' | ')}]` : '';
                    logger.log(`   ✅ 完成${tagStr}`);

                } catch (error) {
                    logger.error(`   ❌ 分析详情页失败: ${error.message}`);
                }

                // 延迟
                await page.waitForTimeout(500 + Math.random() * 1500);
            }

            // 每页结束后持久化扫描缓存，避免中途崩溃丢失进度
            storage.saveScannedCache(scannedCache);
        }

        // =========================================================
        // 保存结果
        // =========================================================
        const output = {
            description: '南+帖子分析结果',
            scannedAt: new Date().toISOString(),
            totalPages: MAX_PAGE,
            summary: {
                longTextCount: longTextPosts.length,
                paywallCount: paywallPosts.length,
                gofileCount: gofilePosts.length,
                skippedByCache: skippedCount,
                newlyScanned: newScannedCount,
                cachedTotal: scannedCache.size
            },
            longTextPosts: longTextPosts,
            paywallPosts: paywallPosts,
            gofilePosts: gofilePosts
        };

        storage.writeJsonAtomic(storage.DATA_FILE, output);

        // 存档历史扫描记录
        const historyFile = storage.saveHistory(output);
        if (historyFile) {
            logger.log(`🗂️ 历史记录已存档: ${path.join(storage.HISTORY_DIR, historyFile)}`);
        }

        // 保存扫描缓存
        storage.saveScannedCache(scannedCache);

        logger.log('\n================================');
        logger.log('✅ 分析完成');
        logger.log(`📊 长文帖 (>${LONG_TEXT_THRESHOLD}字): ${longTextPosts.length} 篇`);
        logger.log(`📊 付费帖: ${paywallPosts.length} 篇`);
        logger.log(`📊 含gofile链接帖: ${gofilePosts.length} 篇`);
        logger.log(`⏭️ 缓存跳过（已扫描过）: ${skippedCount} 篇`);
        logger.log(`📝 本次新增扫描缓存: ${newScannedCount} 条`);
        logger.log(`📋 扫描缓存总数: ${scannedCache.size} 条`);
        logger.log(`📁 结果已保存到: ${storage.DATA_FILE}`);
        logger.log('================================');

    } catch (error) {
        logger.error('❌ 执行过程中发生错误：');
        logger.error(error);
    } finally {
        // 无论成功失败，都尽量持久化扫描进度
        try { storage.saveScannedCache(scannedCache); } catch (e) {}
        await browser.close();
    }
}

module.exports = { runScan };
