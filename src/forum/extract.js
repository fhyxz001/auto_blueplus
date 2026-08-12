// 纯函数解析层：把抓取到的字符串/数据解析成结构化结果，不依赖 Playwright。
const { TID_REGEX, PRICE_REGEX } = require('./selectors');

// 从 URL 中提取 tid 编号（如 2933816）
function extractTid(url) {
    const match = url.match(TID_REGEX);
    return match ? match[1] : null;
}

// 解析售价文本（例: "此帖售价 5 SP币" → 5）
function parsePrice(text) {
    const match = text.match(PRICE_REGEX);
    return match ? parseInt(match[1], 10) : -1;
}

// 清理主楼正文并统计非空白字符数（中英文+数字，排除纯标点/空白）
function countChars(rawText) {
    const cleanText = rawText.replace(/\s+/g, ' ').trim();
    return cleanText.replace(/\s/g, '').length;
}

module.exports = { extractTid, parsePrice, countChars };
