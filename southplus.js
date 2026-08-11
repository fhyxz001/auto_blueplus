const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// =========================================================
// 已扫描缓存管理
// =========================================================
const SCANNED_CACHE_FILE = path.join(process.cwd(), 'scanned_cache.json');

function loadScannedCache() {
    try {
        if (fs.existsSync(SCANNED_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(SCANNED_CACHE_FILE, 'utf8'));
            return new Set(data.tids || []);
        }
    } catch (e) {
        console.error('⚠️ 加载已扫描缓存失败:', e.message);
    }
    return new Set();
}

function saveScannedCache(cache) {
    fs.writeFileSync(SCANNED_CACHE_FILE, JSON.stringify({
        description: '已扫描过的帖子tid列表（不符合标准的帖子），下次运行时会自动跳过',
        count: cache.size,
        tids: Array.from(cache).sort((a, b) => Number(a) - Number(b))
    }, null, 2), 'utf8');
}

// =========================================================
// 从 URL 中提取 tid 编号（如 2933816）
// =========================================================
function extractTid(url) {
    const match = url.match(/tid[=-](\d+)/);
    return match ? match[1] : null;
}

// =========================================================
// 检测页面是否存在购买组件（仅检测，不点击）
// =========================================================
async function hasPurchasePaywall(page) {
    try {
        const purchaseText = await page.locator('text=若发现会员采用欺骗的方法获取财富,请立刻举报,我们会对会员处以2-N倍的罚金,严重者封掉ID!').count();
        return purchaseText > 0;
    } catch (e) {
        return false;
    }
}

// =========================================================
// 读取售价（例: "此帖售价 5 SP币" → 5）
// =========================================================
async function readPrice(page) {
    try {
        const priceSpan = page.locator('span.s3:has-text("此帖售价")');
        const priceCount = await priceSpan.count();
        if (priceCount > 0) {
            const priceText = await priceSpan.first().innerText();
            const priceMatch = priceText.match(/售价\s*(\d+)\s*SP/);
            if (priceMatch) {
                return parseInt(priceMatch[1], 10);
            }
        }
    } catch (e) {}
    return -1; // 无法读取
}

// =========================================================
// 提取主楼正文纯文本（去HTML标签）并计算文字数量
// 返回 { text: string, charCount: number }
// =========================================================
async function extractMainContent(page) {
    try {
        // 先尝试 #read_tpc（展开后的内容），如果没有则尝试 div.tpc_content
        let contentEl = page.locator('#read_tpc');
        let count = await contentEl.count();
        if (count === 0) {
            contentEl = page.locator('div.tpc_content div.f14');
            count = await contentEl.count();
        }
        if (count === 0) {
            contentEl = page.locator('div.tpc_content');
            count = await contentEl.count();
        }

        if (count > 0) {
            const rawText = await contentEl.first().innerText();
            // 去掉空白行，计算实质文字（中英文+数字，排除纯标点/空白）
            const cleanText = rawText.replace(/\s+/g, ' ').trim();
            // 统计非空白字符数作为文字数量
            const charCount = cleanText.replace(/\s/g, '').length;
            return { text: cleanText.substring(0, 500), charCount };
        }
    } catch (e) {
        console.error(`   ❌ 提取主楼内容时出错: ${e.message}`);
    }
    return { text: '', charCount: 0 };
}

// =========================================================
// 提取主楼中的 gofile 链接
// =========================================================
async function extractGofileLinks(page) {
    const links = [];
    try {
        // 只查找主楼内容区域内的链接
        const contentArea = page.locator('#read_tpc');
        let count = await contentArea.count();
        if (count === 0) {
            return links; // 付费框遮挡，无法获取
        }

        const allLinks = await contentArea.locator('a[href*="gofile.io"]').all();
        for (const link of allLinks) {
            const href = await link.getAttribute('href');
            if (href && !links.includes(href)) {
                links.push(href);
                console.log(`   🔗 发现 gofile 链接: ${href}`);
            }
        }
    } catch (e) {
        console.error(`   ❌ 提取 gofile 链接时出错: ${e.message}`);
    }
    return links;
}

// =========================================================
// 尝试 0 SP 购买（如果售价为 0 就点击购买按钮）
// =========================================================
async function tryZeroSpPurchase(page) {
    try {
        const hasPaywall = await hasPurchasePaywall(page);
        if (!hasPaywall) return 'no_paywall';

        const price = await readPrice(page);
        console.log(`   💲 售价: ${price === -1 ? '未知' : price + ' SP币'}`);

        // 收集按钮信息用于诊断
        const allButtons = page.locator('input[class*="btn"]');
        const buttonCount = await allButtons.count();
        const buttonValues = [];
        for (let i = 0; i < buttonCount; i++) {
            const val = await allButtons.nth(i).getAttribute('value');
            if (val) buttonValues.push(val);
        }
        console.log(`   🔘 付费框按钮: [${buttonValues.join(', ')}]`);

        if (price === 0) {
            console.log('   🆓 售价为 0 SP币，免费领取...');
            const buyButton = page.locator('input[class*="btn"]').first();
            await buyButton.click();
            console.log('   ✅ 已点击购买按钮');
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            console.log('   🔄 页面已刷新');
            return 'free_clicked';
        }

        // 兼容旧格式：value="免费"
        const freeButton = page.locator('input[class*="btn"][value="免费"]');
        if (await freeButton.count() > 0) {
            console.log('   🆓 找到"免费"按钮（旧格式），准备点击...');
            await freeButton.first().click();
            console.log('   ✅ 已点击"免费"按钮');
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            console.log('   🔄 页面已刷新');
            return 'free_clicked';
        }

        return 'paid_only';
    } catch (error) {
        console.error(`   ❌ 购买处理出错: ${error.message}`);
        return 'error';
    }
}

// =========================================================
// 启动模式控制：不自动启动扫描
// =========================================================
// 直接运行 `node southplus.js` 时不做任何扫描，提示通过网页控制面板手动触发。
// 只有被 dashboard.js 以 SP_DASHBOARD=1 环境变量拉起时才执行扫描。
if (process.env.SP_DASHBOARD !== '1') {
    console.log('⚠️ 不要直接运行 southplus.js，扫描由网页控制面板手动触发。');
    console.log('');
    console.log('请按以下步骤操作：');
    console.log('  1. 运行: node dashboard.js');
    console.log('  2. 浏览器打开: http://localhost:3456');
    console.log('  3. 在面板中点击「开始扫描」按钮。');
    process.exit(0);
}

(async () => {
    // 代理配置：SP_PROXY 形如 http://host:port 或 socks5://host:port，
    // 未设置则不走代理。可用 SP_PROXY_BYPASS 指定直连白名单，SP_PROXY_USERNAME/PASSWORD 提供认证。
    const proxyOpts = (() => {
        const server = process.env.SP_PROXY;
        if (!server) return {};
        const p = { server };
        if (process.env.SP_PROXY_BYPASS) p.bypass = process.env.SP_PROXY_BYPASS;
        if (process.env.SP_PROXY_USERNAME) p.username = process.env.SP_PROXY_USERNAME;
        if (process.env.SP_PROXY_PASSWORD) p.password = process.env.SP_PROXY_PASSWORD;
        return { proxy: p };
    })();

    const browser = await chromium.launch({
        headless: false,
        ...proxyOpts,
        // Docker 中以 root 运行 Chromium 需要关闭沙箱；本地行为不受影响
        ...(process.env.SP_NO_SANDBOX === '1' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {})
    });

    const context = await browser.newContext({
        storageState: './auth.json'
    });

    const page = await context.newPage();

    // =========================================================
    // 配置
    // =========================================================
    const MAX_PAGE = parseInt(process.env.SP_MAX_PAGE) || 2;
    const LONG_TEXT_THRESHOLD = parseInt(process.env.SP_TEXT_THRESHOLD) || 300; // 大于300字算长文帖
    const baseUrl = 'https://blue-plus.net/';
    const pageUrl = (pageNum) =>
        `https://blue-plus.net/thread.php?fid-9-search-1-orderway-postdate-asc-DESC-page-${pageNum}.html`;

    // 结果分类存储
    const longTextPosts = [];    // 长文帖
    const paywallPosts = [];     // 付费帖（有购买组件）
    const gofilePosts = [];      // 主楼含 gofile 链接的帖子

    // 已扫描缓存（不符合标准的帖子tid）
    const scannedCache = loadScannedCache();
    console.log(`📋 已扫描缓存: ${scannedCache.size} 条记录`);
    let skippedCount = 0;
    let newScannedCount = 0;

    try {
        console.log('正在打开论坛...');

        // =====================================================
        // 循环采集分页
        // =====================================================
        for (let pageNum = 1; pageNum <= MAX_PAGE; pageNum++) {

            const url = pageUrl(pageNum);
            console.log('\n================================');
            console.log(`正在采集第 ${pageNum} 页`);
            console.log(url);
            console.log('================================');

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForTimeout(3000);

            // 第 1 页检查登录
            if (pageNum === 1) {
                const isLoggedIn = await page.locator('text=退出').count() > 0;
                if (isLoggedIn) {
                    console.log('✅ auth.json 生效！目前处于登录状态。');
                } else {
                    console.log('⚠️ 没有检测到"退出"按钮，请检查是否登录成功。');
                }
            }

            // 获取帖子列表
            let rows;
            if (pageNum === 1) {
                console.log('📌 第 1 页：寻找"普通主题"分隔线');
                const normalTopicRow = page.locator('tr.tr2:has(td.tac)').filter({
                    hasText: '普通主题'
                }).first();

                if (await normalTopicRow.count() === 0) {
                    console.log('❌ 第 1 页没有找到"普通主题"分隔线');
                    break;
                }
                console.log('✅ 找到"普通主题"分隔线');
                rows = normalTopicRow.locator(
                    'xpath=following-sibling::tr[contains(@class, "tr3") and contains(@class, "t_one")]'
                );
            } else {
                console.log(`📌 第 ${pageNum} 页：直接遍历所有普通帖子`);
                rows = page.locator('tr.tr3.t_one');
            }

            const rowCount = await rows.count();
            console.log(`第 ${pageNum} 页发现 ${rowCount} 个帖子`);
            if (rowCount === 0) continue;

            let pageThreadCount = 0;
            const pageThreads = [];

            for (let i = 0; i < rowCount; i++) {
                const row = rows.nth(i);

                const link = row.locator('h3 a').first();
                if (await link.count() === 0) continue;

                const title = (await link.innerText()).trim();
                if (title.includes('公告')) {
                    console.log(`⏭️ 跳过公告：${title}`);
                    continue;
                }

                const href = await link.getAttribute('href');
                if (!href) continue;

                const fullUrl = new URL(href, baseUrl).href;
                const tid = extractTid(fullUrl);

                pageThreads.push({ title, href, url: fullUrl, page: pageNum, tid });
                pageThreadCount++;
                console.log(`[第 ${pageNum} 页 #${pageThreadCount}] ${title}`);
                console.log(`    ${fullUrl}`);
            }

            console.log(`✅ 第 ${pageNum} 页列表采集完成，共 ${pageThreadCount} 个帖子`);

            // =====================================================
            // 逐个打开详情页分析
            // =====================================================
            console.log(`\n📋 开始分析第 ${pageNum} 页的详情页...`);

            for (let i = 0; i < pageThreads.length; i++) {
                const thread = pageThreads[i];
                console.log(`\n[${pageNum}页 ${i + 1}/${pageThreads.length}] ${thread.title}`);
                console.log(`   TID: ${thread.tid}`);

                try {
                    // 检查缓存：已扫描过且不符合标准的帖子跳过
                    if (thread.tid && scannedCache.has(thread.tid)) {
                        console.log(`   ⏭️ 缓存记录：该帖子已扫描过（不符合标准），跳过`);
                        skippedCount++;
                        continue;
                    }

                    await page.goto(thread.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    await page.waitForTimeout(2000);

                    // 获取详情页标题
                    const detailTitle = await page.locator('h1#subject_tpc').first();
                    if (await detailTitle.count() > 0) {
                        const titleText = await detailTitle.innerText();
                        if (titleText.trim()) thread.title = titleText.trim();
                    }

                    // -------- 检测付费框 + 0SP购买 --------
                    const initialHasPaywall = await hasPurchasePaywall(page);
                    const price = initialHasPaywall ? await readPrice(page) : -1;

                    console.log(`   🔍 付费框: ${initialHasPaywall ? '有 (售价: ' + (price === -1 ? '未知' : price + ' SP') + ')' : '无'}`);

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
                    const content = await extractMainContent(page);
                    const charCount = content.charCount;
                    const isLongText = charCount > LONG_TEXT_THRESHOLD;
                    console.log(`   📝 主楼文字数: ${charCount} ${isLongText ? '🔥 长文帖' : ''}`);

                    // -------- 提取 gofile 链接 --------
                    const gofileLinks = await extractGofileLinks(page);
                    const hasGofile = gofileLinks.length > 0;

                    // -------- 记录结果 --------
                    const record = {
                        tid: thread.tid,
                        title: thread.title,
                        url: thread.url,
                        page: thread.page
                    };

                    // 标记分类
                    const tags = [];
                    let isWorthy = false; // 是否符合任一标准

                    if (isLongText) {
                        isWorthy = true;
                        tags.push('长文帖');
                        longTextPosts.push({
                            ...record,
                            charCount,
                            paywallStatus,
                            price
                        });
                    }

                    if (initialHasPaywall) {
                        isWorthy = true;
                        tags.push(price === 0 ? '0SP免费帖' : '付费帖');
                        paywallPosts.push({
                            ...record,
                            price,
                            paywallStatus,
                            charCount,
                            isLongText
                        });
                    }

                    if (hasGofile) {
                        isWorthy = true;
                        tags.push('含gofile链接');
                        gofilePosts.push({
                            ...record,
                            gofileLinks,
                            paywallStatus,
                            charCount,
                            isLongText
                        });
                    }

                    // 不符合任何标准的帖子，记录tid到缓存，下次跳过
                    if (!isWorthy && thread.tid) {
                        scannedCache.add(thread.tid);
                        newScannedCount++;
                        console.log(`   📝 不符合标准，已加入扫描缓存 (tid=${thread.tid})`);
                    }

                    const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';
                    console.log(`   ✅ 完成${tagStr}`);

                } catch (error) {
                    console.error(`   ❌ 分析详情页失败: ${error.message}`);
                }

                // 延迟
                await page.waitForTimeout(500 + Math.random() * 1500);
            }
        }

        // =========================================================
        // 保存结果
        // =========================================================
        const outputPath = path.join(process.cwd(), 'threads_analysis.json');
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

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

        // 保存扫描缓存
        saveScannedCache(scannedCache);

        console.log('\n================================');
        console.log('✅ 分析完成');
        console.log(`📊 长文帖 (>${LONG_TEXT_THRESHOLD}字): ${longTextPosts.length} 篇`);
        console.log(`📊 付费帖: ${paywallPosts.length} 篇`);
        console.log(`📊 含gofile链接帖: ${gofilePosts.length} 篇`);
        console.log(`⏭️ 缓存跳过（不符合标准）: ${skippedCount} 篇`);
        console.log(`📝 本次新增扫描缓存: ${newScannedCount} 条`);
        console.log(`📋 扫描缓存总数: ${scannedCache.size} 条`);
        console.log(`📁 结果已保存到: ${outputPath}`);
        console.log('================================');

    } catch (error) {
        console.error('❌ 执行过程中发生错误：');
        console.error(error);
    } finally {
        await browser.close();
    }
})();
