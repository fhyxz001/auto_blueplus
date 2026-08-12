const test = require('node:test');
const assert = require('node:assert');

const { extractTid, parsePrice, countChars } = require('../src/forum/extract');
const { classifyPost } = require('../src/forum/classify');
const { mergeRecords } = require('../src/forum/merge');

test('extractTid 从 URL 提取 tid', () => {
    assert.strictEqual(extractTid('https://blue-plus.net/read.php?tid-2933816.html'), '2933816');
    assert.strictEqual(extractTid('https://blue-plus.net/read.php?tid=123.html'), '123');
    assert.strictEqual(extractTid('https://blue-plus.net/read.php?fid=1.html'), null);
});

test('parsePrice 解析售价文本', () => {
    assert.strictEqual(parsePrice('此帖售价 5 SP币'), 5);
    assert.strictEqual(parsePrice('此帖售价 0 SP币'), 0);
    assert.strictEqual(parsePrice('没有售价'), -1);
});

test('countChars 统计非空白字符数', () => {
    assert.strictEqual(countChars('  你好 世界  '), 4);
    assert.strictEqual(countChars('abc\n123'), 6);
    assert.strictEqual(countChars(''), 0);
});

test('classifyPost 正确分类长文/付费/gofile', () => {
    const r = classifyPost({
        tid: '1', title: 't', url: 'u', page: 1,
        charCount: 500, isLongText: true, hasPaywall: false,
        price: -1, paywallStatus: 'none', gofileLinks: []
    });
    assert.ok(r.longText, '应为长文帖');
    assert.strictEqual(r.paywall, null);
    assert.strictEqual(r.gofile, null);
    assert.ok(r.tags.includes('长文帖'));

    const p = classifyPost({
        tid: '2', title: 't', url: 'u', page: 1,
        charCount: 10, isLongText: false, hasPaywall: true,
        price: 5, paywallStatus: 'paid_only', gofileLinks: ['https://gofile.io/x']
    });
    assert.ok(p.paywall, '应为付费帖');
    assert.ok(p.gofile, '应为 gofile 帖');
    assert.ok(p.tags.includes('付费帖'));
    assert.ok(p.tags.includes('含gofile链接'));
});

test('mergeRecords 按 tid 合并去重并补全字段', () => {
    const rec1 = {
        scannedAt: '2026-01-01T00:00:00Z', totalPages: 2,
        longTextPosts: [{ tid: '1', title: '旧标题', charCount: 100, page: 1 }],
        paywallPosts: [], gofilePosts: []
    };
    const rec2 = {
        scannedAt: '2026-01-02T00:00:00Z', totalPages: 3,
        longTextPosts: [{ tid: '1', title: '', charCount: 200, page: 1 }],
        paywallPosts: [{ tid: '2', price: 5, charCount: 10 }],
        gofilePosts: []
    };

    const m = mergeRecords([rec2, rec1]);
    assert.strictEqual(m.totalPages, 3);
    assert.strictEqual(m.scannedAt, '2026-01-02T00:00:00Z');
    assert.strictEqual(m.longTextPosts.length, 1);
    assert.strictEqual(m.longTextPosts[0].charCount, 200); // 取最大
    assert.strictEqual(m.longTextPosts[0].title, '旧标题'); // 空值补全
    assert.strictEqual(m.paywallPosts.length, 1);
});
