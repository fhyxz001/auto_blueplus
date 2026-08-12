// 帖子分类规则：根据分析结果判定帖子归属哪几类，并生成各分类的记录。
// 纯函数，无 I/O，可单元测试。

/**
 * @param {Object} analysis
 * @param {string} analysis.tid
 * @param {string} analysis.title
 * @param {string} analysis.url
 * @param {number} analysis.page
 * @param {number} analysis.charCount
 * @param {boolean} analysis.isLongText
 * @param {boolean} analysis.hasPaywall
 * @param {number} analysis.price
 * @param {string} analysis.paywallStatus
 * @param {string[]} analysis.gofileLinks
 * @returns {{tags: string[], longText: Object|null, paywall: Object|null, gofile: Object|null}}
 */
function classifyPost(analysis) {
    const record = {
        tid: analysis.tid,
        title: analysis.title,
        url: analysis.url,
        page: analysis.page
    };

    const tags = [];
    const result = { tags, longText: null, paywall: null, gofile: null };

    if (analysis.isLongText) {
        tags.push('长文帖');
        result.longText = {
            ...record,
            charCount: analysis.charCount,
            paywallStatus: analysis.paywallStatus,
            price: analysis.price
        };
    }

    if (analysis.hasPaywall) {
        tags.push(analysis.price === 0 ? '0SP免费帖' : '付费帖');
        result.paywall = {
            ...record,
            price: analysis.price,
            paywallStatus: analysis.paywallStatus,
            charCount: analysis.charCount,
            isLongText: analysis.isLongText
        };
    }

    if (analysis.gofileLinks.length > 0) {
        tags.push('含gofile链接');
        result.gofile = {
            ...record,
            gofileLinks: analysis.gofileLinks,
            paywallStatus: analysis.paywallStatus,
            charCount: analysis.charCount,
            isLongText: analysis.isLongText
        };
    }

    return result;
}

module.exports = { classifyPost };
