// 历史扫描记录合并：把多轮扫描结果按 tid 合并去重。
// 缺失/空值用其他记录补全，charCount 取最大，gofile 链接取并集，付费状态优先非 none。
// 纯函数，输入是已解析的记录对象数组（最新在前），不涉及文件 I/O。

function mergeRecords(records) {
    if (!Array.isArray(records) || records.length === 0) return null;

    const longMap = new Map();
    const paywallMap = new Map();
    const gofileMap = new Map();
    let latestAt = null;
    let totalPages = 0;

    // 按 tid 合并单条记录：先出现的（更新）记录为基准，用后出现的补全缺失字段
    const mergeInto = (map, post) => {
        if (!post || !post.tid) return;
        if (!map.has(post.tid)) { map.set(post.tid, { ...post }); return; }
        const cur = map.get(post.tid);
        for (const k of Object.keys(post)) {
            const nv = post[k];
            const cv = cur[k];
            if (Array.isArray(nv)) {
                cur[k] = Array.from(new Set([...(cv || []), ...nv]));
            } else if (k === 'charCount') {
                if (Number(nv) > Number(cv || 0)) cur[k] = nv;
            } else if (k === 'paywallStatus') {
                if ((!cv || cv === 'none') && nv) cur[k] = nv;
            } else if ((cv == null || cv === '' || cv === -1) && nv != null && nv !== '') {
                cur[k] = nv;
            }
        }
    };

    for (const rec of records) {
        if (rec.scannedAt && (!latestAt || rec.scannedAt > latestAt)) latestAt = rec.scannedAt;
        totalPages = Math.max(totalPages, rec.totalPages || 0);
        for (const p of rec.longTextPosts || []) mergeInto(longMap, p);
        for (const p of rec.paywallPosts || []) mergeInto(paywallMap, p);
        for (const p of rec.gofilePosts || []) mergeInto(gofileMap, p);
    }

    return {
        description: '南+帖子分析结果（历史合并）',
        scannedAt: latestAt,
        totalPages,
        merged: true,
        mergedFiles: records.length,
        summary: {
            longTextCount: longMap.size,
            paywallCount: paywallMap.size,
            gofileCount: gofileMap.size
        },
        longTextPosts: Array.from(longMap.values()),
        paywallPosts: Array.from(paywallMap.values()),
        gofilePosts: Array.from(gofileMap.values())
    };
}

module.exports = { mergeRecords };
