// Playwright 读取层：把 DOM 元素读成纯数据（字符串/数组），不含业务解析逻辑。
// 业务解析（如 parsePrice / countChars）在 extract.js 中完成，保持可测试。
const { SELECTORS } = require('./selectors');
const logger = require('../logger');

// 检测页面是否存在购买组件（仅检测，不点击）
async function hasPaywall(page) {
    try {
        const count = await page.locator('text=' + SELECTORS.paywallText).count();
        return count > 0;
    } catch (e) {
        return false;
    }
}

// 读取售价文本（返回原始 innerText，交由 parsePrice 解析）
async function readPriceText(page) {
    try {
        const span = page.locator(SELECTORS.priceSpan);
        if (await span.count() > 0) {
            return await span.first().innerText();
        }
    } catch (e) {}
    return '';
}

// 读取主楼正文纯文本（按优先级回退选择器）
async function readMainContentText(page) {
    try {
        let el = page.locator(SELECTORS.contentPrimary);
        if (await el.count() === 0) {
            el = page.locator(SELECTORS.contentSecondary);
            if (await el.count() === 0) {
                el = page.locator(SELECTORS.contentFallback);
            }
        }
        if (await el.count() > 0) {
            return await el.first().innerText();
        }
    } catch (e) {
        logger.error(`   ❌ 提取主楼内容时出错: ${e.message}`);
    }
    return '';
}

// 读取主楼内容区内的 gofile 链接（去重）
async function readGofileLinks(page) {
    const links = [];
    try {
        const contentArea = page.locator(SELECTORS.contentPrimary);
        if (await contentArea.count() === 0) {
            return links; // 付费框遮挡，无法获取
        }
        const allLinks = await contentArea.locator(SELECTORS.gofileLink).all();
        for (const link of allLinks) {
            const href = await link.getAttribute('href');
            if (href && !links.includes(href)) {
                links.push(href);
                logger.log(`   🔗 发现 gofile 链接: ${href}`);
            }
        }
    } catch (e) {
        logger.error(`   ❌ 提取 gofile 链接时出错: ${e.message}`);
    }
    return links;
}

// 读取详情页标题
async function readDetailTitle(page) {
    try {
        const el = page.locator(SELECTORS.detailTitle).first();
        if (await el.count() > 0) {
            return (await el.innerText()).trim();
        }
    } catch (e) {}
    return '';
}

module.exports = { hasPaywall, readPriceText, readMainContentText, readGofileLinks, readDetailTitle };
