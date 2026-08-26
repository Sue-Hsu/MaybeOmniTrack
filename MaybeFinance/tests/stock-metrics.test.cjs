const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../stock-metrics.js');

test('ETF evaluation excludes company-only metrics and uses five-year dividend threshold', () => {
    const result = metrics.evaluateStockHealth({
        id: '006208',
        isEtf: true,
        marketCap: 4455,
        eps5y: 6.2,
        divYears: 6,
        payoutRatio: 90,
        yield: 3.42,
        beta: 0.98,
        pb: null,
        pe: null
    });
    assert.equal(result.score, 2);
    assert.equal(result.total, 4);
    assert.equal(result.metrics.find(item => item.label === '5年平均EPS').pass, 'na');
    assert.equal(result.metrics.find(item => item.label === '盈餘分配率').pass, 'na');
    assert.equal(result.metrics.find(item => item.label === '連續配息').pass, 'pass');
});

test('stock thresholds match specs for beta and PE boundaries', () => {
    const base = {
        id: '2330', marketCap: 1000, eps5y: 10, divYears: 10,
        payoutRatio: 70, yield: 5, pb: 2, beta: 0.8, pe: 20
    };
    const boundary = metrics.evaluateStockHealth(base);
    assert.equal(boundary.metrics.find(item => item.label === 'Beta 波動度').pass, 'warn');
    assert.equal(boundary.metrics.find(item => item.label === '本益比 PE').pass, 'warn');

    const invalidPe = metrics.evaluateStockHealth({ ...base, beta: 0.79, pe: 0 });
    assert.equal(invalidPe.metrics.find(item => item.label === '本益比 PE').pass, 'warn');
});

test('annual dividend uses the newest periods after sorting', () => {
    const rows = [
        { year: '2025Q4', cash_dividend: 0.866, ex_dividend_date: '2025-10-23' },
        { year: '2026Q1', cash_dividend: 0.866, ex_dividend_date: '2026-01-22' },
        { year: '2026Q3', cash_dividend: 1.35, ex_dividend_date: '2026-07-21' },
        { year: '2026Q2', cash_dividend: 1.0, ex_dividend_date: '2026-04-23' },
        { year: '2025Q3', cash_dividend: 1.07, ex_dividend_date: '2025-07-16' }
    ];
    assert.equal(metrics.calculateAnnualCashDividend(rows), 4.082);
});

test('consecutive dividend years stop at the first gap', () => {
    const rows = [2026, 2025, 2024, 2022].map(year => ({
        year: String(year), cash_dividend: 1, ex_dividend_date: `${year}-07-01`
    }));
    assert.equal(metrics.calculateConsecutiveDividendYears(rows), 3);
});

test('dividend averages use the most recent calendar years', () => {
    const rows = [
        { year: '2022', cash_dividend: 1, ex_dividend_date: '2022-07-01' },
        { year: '2023', cash_dividend: 2, ex_dividend_date: '2023-07-01' },
        { year: '2024H1', cash_dividend: 1, ex_dividend_date: '2024-07-01' },
        { year: '2024H2', cash_dividend: 2, ex_dividend_date: '2024-11-01' },
        { year: '2025', cash_dividend: 4, ex_dividend_date: '2025-07-01' },
        { year: '2026', cash_dividend: 5, ex_dividend_date: '2026-07-01' }
    ];
    const result = metrics.calculateDividendAverages(rows);
    assert.equal(result.avg3, 4);
    assert.equal(result.avg5, 3);
});

test('ETF size estimate converts issued units and price to NT$100m', () => {
    assert.equal(metrics.estimateEtfFundSize('1,860,040,000', 239.45).toFixed(2), '4453.87');
});

test('beta calculation aligns observations by trade date', () => {
    const benchmark = [];
    const stock = [];
    let benchmarkClose = 100;
    let stockClose = 50;
    for (let day = 1; day <= 25; day++) {
        const date = `2026-01-${String(day).padStart(2, '0')}`;
        const marketReturn = day % 2 ? 0.01 : -0.005;
        benchmarkClose *= 1 + marketReturn;
        stockClose *= 1 + marketReturn * 0.75;
        benchmark.push({ trade_date: date, close_price: benchmarkClose });
        stock.push({ trade_date: date, close_price: stockClose });
    }
    assert.ok(Math.abs(metrics.calculateBeta(stock, benchmark) - 0.75) < 1e-10);
});

test('broad-market ETFs are not classified as high-income ETFs', () => {
    const broad = { id: '0050', name: '元大台灣50', isEtf: true, yield: 1.53 };
    const highDividend = { id: '0056', name: '元大高股息', isEtf: true, yield: 7.77 };
    assert.equal(metrics.classifyStock(broad, { indexName: '臺灣50指數' }), 'dividend');
    assert.equal(metrics.classifyStock(highDividend, { indexName: '臺灣高股息指數' }), 'cashflow');
});
