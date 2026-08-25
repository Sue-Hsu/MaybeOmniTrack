-- =======================================================
-- MaybeOmniTrack - 終極乾淨版 Supabase 5 大關聯式資料表
-- （機密金鑰由 Firebase 保險庫保管，Supabase 專注核心業務數據）
-- 請在 Supabase Dashboard -> SQL Editor 中貼上並點擊 Run
-- =======================================================

-- 1. 清理舊表格
DROP TABLE IF EXISTS public.stocks, public.stock_prices, public.watchlist, public.exchange_rates, public.gold_prices, public.system_settings CASCADE;

-- 1. 股票基本面與存股健檢資料表 (stocks)
CREATE TABLE public.stocks (
    id BIGSERIAL PRIMARY KEY,
    stock_id VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    price NUMERIC(10, 2),
    market_cap NUMERIC(15, 2), -- 股本/市值 (億)
    eps_5y_avg NUMERIC(8, 2),   -- 近5年平均EPS
    div_years INT,              -- 連續配息年數
    payout_ratio NUMERIC(5, 2), -- 盈餘分配率 (%)
    dividend_yield NUMERIC(5, 2),-- 現金殖利率 (%)
    beta NUMERIC(5, 2),         -- Beta 波動係數
    pb_ratio NUMERIC(5, 2),     -- 股價淨值比 PB
    pe_ratio NUMERIC(5, 2),     -- 本益比 PE
    category_tag VARCHAR(50),   -- 分類標籤: 適合穩健存股 / 適合領高利息 / 適合波段賺價差
    diagnosis_note TEXT,        -- 大白話診斷評語
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 股票歷史收盤行情資料表 (stock_prices)
CREATE TABLE public.stock_prices (
    id BIGSERIAL PRIMARY KEY,
    stock_id VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    open_price NUMERIC(10, 2),
    high_price NUMERIC(10, 2),
    low_price NUMERIC(10, 2),
    close_price NUMERIC(10, 2) NOT NULL,
    volume BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(stock_id, trade_date)
);

-- 3. 自選股票清單資料表 (watchlist)
CREATE TABLE public.watchlist (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) DEFAULT 'shared_user',
    stock_id VARCHAR(10) NOT NULL,
    stock_name VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, stock_id)
);

-- 4. 歷史外幣匯率快取資料表 (exchange_rates)
-- 支援多幣別換算：從 [from_currency] 換成 [to_currency]
CREATE TABLE public.exchange_rates (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    from_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    to_currency VARCHAR(10) NOT NULL DEFAULT 'TWD',
    spot_sell NUMERIC(14, 4), -- 銀行賣出價 (換出價)
    spot_buy NUMERIC(14, 4),  -- 銀行買入價 (換回價)
    cash_sell NUMERIC(14, 4),
    cash_buy NUMERIC(14, 4),
    rate NUMERIC(14, 6),      -- 交叉匯率基準價
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trade_date, from_currency, to_currency)
);

-- 5. 歷史金價快取資料表 (gold_prices)
CREATE TABLE public.gold_prices (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE UNIQUE NOT NULL,
    usd_per_oz NUMERIC(12, 4),
    twd_per_gram NUMERIC(12, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 啟用 Row Level Security (RLS) 並允許公開讀寫
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gold_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public for stocks" ON public.stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public for stock_prices" ON public.stock_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public for watchlist" ON public.watchlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public for exchange_rates" ON public.exchange_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public for gold_prices" ON public.gold_prices FOR ALL USING (true) WITH CHECK (true);

-- 授權 anon (公開) 與 authenticated (登入) 角色對資料表的所有操作權限
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
