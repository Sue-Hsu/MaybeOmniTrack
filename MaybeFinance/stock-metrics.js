(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.StockMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function numberOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(String(value).replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function isEtfCode(code) {
        return /^00[0-9A-Z]{2,6}$/i.test(String(code || '').trim());
    }

    function getDividendDate(row) {
        return [row.ex_dividend_date, row.payment_date, row.announcement_date]
            .find(value => value && value !== '--') || '';
    }

    function getDividendYear(row) {
        const dateMatch = getDividendDate(row).match(/^(\d{4})/);
        if (dateMatch) return Number(dateMatch[1]);
        const yearMatch = String(row.formatted_period || row.year || '').match(/(\d{2,4})/);
        if (!yearMatch) return null;
        const year = Number(yearMatch[1]);
        return year < 1900 ? year + 1911 : year;
    }

    function sortDividendRows(rows) {
        return (rows || [])
            .filter(row => numberOrNull(row.cash_dividend) > 0 || numberOrNull(row.stock_dividend) > 0)
            .slice()
            .sort((a, b) => getDividendDate(b).localeCompare(getDividendDate(a)));
    }

    function detectDividendFrequency(rows) {
        const counts = new Map();
        for (const row of rows) {
            const year = getDividendYear(row);
            if (year) counts.set(year, (counts.get(year) || 0) + 1);
        }
        const maxCount = Math.max(1, ...counts.values());
        if (maxCount >= 6) return { name: 'monthly', periods: 12 };
        if (maxCount >= 3) return { name: 'quarterly', periods: 4 };
        if (maxCount === 2) return { name: 'half', periods: 2 };
        return { name: 'annual', periods: 1 };
    }

    function calculateAnnualCashDividend(rows) {
        const sorted = sortDividendRows(rows);
        if (sorted.length === 0) return 0;
        const { periods } = detectDividendFrequency(sorted);
        return sorted.slice(0, periods)
            .reduce((sum, row) => sum + (numberOrNull(row.cash_dividend) || 0), 0);
    }

    function calculateConsecutiveDividendYears(rows) {
        const years = [...new Set(sortDividendRows(rows)
            .filter(row => (numberOrNull(row.cash_dividend) || 0) > 0)
            .map(getDividendYear)
            .filter(Boolean))]
            .sort((a, b) => b - a);
        if (years.length === 0) return 0;
        let count = 1;
        for (let index = 1; index < years.length; index++) {
            if (years[index] !== years[index - 1] - 1) break;
            count++;
        }
        return count;
    }

    function calculateDividendAverages(rows) {
        const totals = new Map();
        for (const row of sortDividendRows(rows)) {
            const year = getDividendYear(row);
            if (!year) continue;
            totals.set(year, (totals.get(year) || 0) + (numberOrNull(row.cash_dividend) || 0));
        }
        const values = [...totals.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([, total]) => total);
        const average = count => {
            const selected = values.slice(0, count);
            return selected.length
                ? selected.reduce((sum, value) => sum + value, 0) / selected.length
                : 0;
        };
        return { avg3: average(3), avg5: average(5), yearlyValues: values };
    }

    function calculateBeta(stockRows, benchmarkRows, minimumObservations = 20) {
        const toReturns = rows => {
            const sorted = (rows || [])
                .filter(row => row.trade_date && numberOrNull(row.close_price) > 0)
                .slice()
                .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
            const returns = new Map();
            for (let index = 1; index < sorted.length; index++) {
                const previous = numberOrNull(sorted[index - 1].close_price);
                const current = numberOrNull(sorted[index].close_price);
                if (previous > 0 && current > 0) returns.set(sorted[index].trade_date, current / previous - 1);
            }
            return returns;
        };
        const stockReturns = toReturns(stockRows);
        const benchmarkReturns = toReturns(benchmarkRows);
        const dates = [...stockReturns.keys()].filter(date => benchmarkReturns.has(date));
        if (dates.length < minimumObservations) return null;
        const xs = dates.map(date => benchmarkReturns.get(date));
        const ys = dates.map(date => stockReturns.get(date));
        const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
        const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
        let covariance = 0;
        let variance = 0;
        for (let index = 0; index < xs.length; index++) {
            covariance += (xs[index] - meanX) * (ys[index] - meanY);
            variance += (xs[index] - meanX) ** 2;
        }
        return variance > 0 ? covariance / variance : null;
    }

    function estimateEtfFundSize(unitCount, price) {
        const units = numberOrNull(unitCount);
        const currentPrice = numberOrNull(price);
        if (!(units > 0) || !(currentPrice > 0)) return null;
        return units * currentPrice / 100000000;
    }

    function isHighDividendEtf(metadata, name) {
        const text = `${name || ''} ${metadata?.indexName || ''} ${metadata?.fundType || ''}`;
        return /(高股息|高息|優息|股利|收益)/.test(text);
    }

    function classifyStock(stock, metadata) {
        const isEtf = stock.isEtf ?? isEtfCode(stock.id);
        const dividendYield = numberOrNull(stock.yield) || 0;
        if (isEtf) {
            return isHighDividendEtf(metadata, stock.name) && dividendYield >= 5 ? 'cashflow' : 'dividend';
        }
        if ((numberOrNull(stock.beta) || 0) >= 1 || dividendYield < 3) return 'swing';
        if (dividendYield >= 5) return 'cashflow';
        return 'dividend';
    }

    function buildDiagnosis(stock, metadata) {
        const isEtf = stock.isEtf ?? isEtfCode(stock.id);
        const dividendYield = numberOrNull(stock.yield);
        const yieldText = dividendYield === null ? '尚無可靠殖利率' : `近期待遇殖利率約 ${dividendYield.toFixed(2)}%`;
        if (isEtf) {
            const indexText = metadata?.indexName ? `追蹤「${metadata.indexName}」` : '指數型';
            if (isHighDividendEtf(metadata, stock.name)) {
                return `${stock.name} (${stock.id})：${indexText}的高股息 ETF，${yieldText}；應以實際配息紀錄、基金規模與波動度評估，不套用公司 EPS 或盈餘分配率。`;
            }
            return `${stock.name} (${stock.id})：${indexText}的市值型 ETF，適合長期分散投資，並非高股息策略；${yieldText}。`;
        }
        return `${stock.name} (${stock.id})：目前現金殖利率${dividendYield === null ? '尚無可靠資料' : `約 ${dividendYield.toFixed(2)}%`}，請搭配實際 EPS、盈餘分配率、估值與波動度綜合判斷。`;
    }

    function evaluateStockHealth(stock) {
        const metrics = [];
        let score = 0;
        let total = 0;
        const isEtf = stock.isEtf ?? isEtfCode(stock.id);
        const add = (label, value, available, passed, failedStatus, description) => {
            if (!available) {
                metrics.push({ label, val: '不適用', pass: 'na', desc: description });
                return;
            }
            total++;
            if (passed) score++;
            metrics.push({ label, val: value, pass: passed ? 'pass' : failedStatus, desc: description });
        };

        const fundSize = numberOrNull(stock.marketCap);
        add(isEtf ? '基金規模估算' : '股本規模', fundSize === null ? '' : `${fundSize.toFixed(0)} 億`, fundSize !== null, fundSize >= 300, 'warn', '門檻為 300 億元');

        const eps = numberOrNull(stock.eps5y);
        add('5年平均EPS', eps === null ? '' : `${eps} 元`, !isEtf && eps !== null, eps >= 1, 'fail', isEtf ? 'ETF 不使用公司 EPS 評分' : '門檻為 1 元');

        const years = numberOrNull(stock.divYears);
        const yearThreshold = isEtf ? 5 : 10;
        add('連續配息', years === null ? '' : `${years} 年`, years !== null, years >= yearThreshold, 'warn', `門檻為 ${yearThreshold} 年`);

        const payout = numberOrNull(stock.payoutRatio);
        add('盈餘分配率', payout === null ? '' : `${payout}%`, !isEtf && payout !== null, payout >= 70, 'warn', isEtf ? 'ETF 配息來源不同，不使用公司盈餘分配率' : '門檻為 70%');

        const dividendYield = numberOrNull(stock.yield);
        add('現金殖利率', dividendYield === null ? '' : `${dividendYield}%`, dividendYield !== null, dividendYield >= 5, dividendYield >= 4 ? 'warn' : 'fail', '門檻為 5%');

        const beta = numberOrNull(stock.beta);
        add('Beta 波動度', beta === null ? '' : `${beta}`, beta !== null, beta < 0.8, 'warn', '門檻為小於 0.8');

        const pb = numberOrNull(stock.pb);
        add('股價淨值比', pb === null ? '' : `${pb}`, pb !== null && pb > 0, pb > 0 && pb < 2.5, 'fail', isEtf && pb === null ? '需使用 ETF 投資組合官方 P/B' : '門檻為小於 2.5');

        const pe = numberOrNull(stock.pe);
        add('本益比 PE', pe === null ? '' : `${pe}`, pe !== null, pe > 0 && pe < 20, 'warn', isEtf && pe === null ? '需使用 ETF 投資組合官方 P/E' : '門檻為 0 到 20 之間');

        return { score, total, metrics };
    }

    return {
        numberOrNull,
        isEtfCode,
        sortDividendRows,
        detectDividendFrequency,
        calculateAnnualCashDividend,
        calculateConsecutiveDividendYears,
        calculateDividendAverages,
        calculateBeta,
        estimateEtfFundSize,
        isHighDividendEtf,
        classifyStock,
        buildDiagnosis,
        evaluateStockHealth
    };
});
