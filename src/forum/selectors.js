// 南+ 论坛的 DOM 选择器与页面结构常量集中在此。
// 论坛一旦改版，只需改这一处，无需在扫描逻辑里到处翻找魔法字符串。

const SELECTORS = {
    // 付费框特征文案（用于判断帖子是否有购买组件）
    paywallText: '若发现会员采用欺骗的方法获取财富,请立刻举报,我们会对会员处以2-N倍的罚金,严重者封掉ID!',
    // 售价所在元素（"此帖售价 N SP币"）
    priceSpan: 'span.s3:has-text("此帖售价")',
    // 主楼正文内容区（按优先级依次回退）
    contentPrimary: '#read_tpc',
    contentSecondary: 'div.tpc_content div.f14',
    contentFallback: 'div.tpc_content',
    // 主楼内容区内的 gofile 链接
    gofileLink: 'a[href*="gofile.io"]',
    // 付费框内的购买按钮
    buyButton: 'input[class*="btn"]',
    // 旧格式免费按钮（value="免费"）
    freeButtonOld: 'input[class*="btn"][value="免费"]',
    // 登录态判断：页面上的"退出"按钮
    logoutText: '退出',
    // 列表页：第 1 页"普通主题"分隔线行
    normalTopicDivider: 'tr.tr2:has(td.tac)',
    // 分隔线之后的普通主题行（XPath）
    normalTopicRows: 'xpath=following-sibling::tr[contains(@class, "tr3") and contains(@class, "t_one")]',
    // 非第 1 页：直接遍历所有普通帖子行
    pageRows: 'tr.tr3.t_one',
    // 行内标题链接
    rowTitleLink: 'h3 a',
    // 详情页标题
    detailTitle: 'h1#subject_tpc'
};

const BASE_URL = 'https://blue-plus.net/';
const TID_REGEX = /tid[=-](\d+)/;
const PRICE_REGEX = /售价\s*(\d+)\s*SP/;

function pageUrl(pageNum) {
    return `${BASE_URL}thread.php?fid-9-search-1-orderway-postdate-asc-DESC-page-${pageNum}.html`;
}

module.exports = { SELECTORS, BASE_URL, TID_REGEX, PRICE_REGEX, pageUrl };
