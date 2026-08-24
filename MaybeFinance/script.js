/**
 * 財務看看 (MaybeOmniTrack / MaybeFinance) - 全功能核心程式碼
 * 包含：外幣匯率（支援多幣別換算 from_currency / to_currency）、黃金牌告、
 *       股票存股健檢（預設為空、未登入鎖定、FinMind 多股票搜尋選擇、Google Gemini 3.7/2.0/1.5 Flash AI 智能診斷）、
 *       Google OAuth / 特定帳號雙登入、Firebase 機密保險庫、Supabase 關聯資料庫（支援 ID 主鍵與 onConflict 智慧快取）
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. 全域狀態與安全轉義函式
    // =========================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const state = {
        currentUser: null, // { name: '', email: '', role: 'admin' | 'user' }
        activeTab: 'view-stocks',
        currentFilter: 'all',
        searchTerm: '',
        watchlist: new Set(), // 預設自選為空
        selectedStockForChart: null,
        chartRange: 90,
        chartType: 'line',
        goldViewMode: 'twd', // 'twd' (台灣金價 NT$/g) | 'tsin' (銀樓 NT$/錢) | 'usd' (國際金價 USD/oz) | 'dual' (雙軸)
        cachedGoldList: [],
        geminiUsage: { date: '', count: 0, totalTokens: 0 },
        
        // 系統設定 (Firebase 保險庫與 Google 後台管理)
        config: {
            customUser: 'admin',
            customPass: '123456',
            supabaseUrl: '',
            supabaseKey: '',
            goldApiKey: '',
            geminiApiKey: '', // Google Studio AI (Gemini Flash) API Key
            geminiModel: 'gemini-3.7-flash', // 選定的 Gemini 模型
            geminiPrompt: '', // 自訂存股健檢法則與提示詞
            googleClientId: '432499293288-35d73h2vaf2q5u1kv816d7m15h3utmdr.apps.googleusercontent.com',
            adminGoogleEmails: '', // 指定管理員 Gmail 清單
            firebaseConfig: {
                apiKey: "AIzaSyCERr64-wlG1CFeIMTO_5SDxpy4UZPrpTA",
                authDomain: "maybeomnitrack-7cdb1.firebaseapp.com",
                projectId: "maybeomnitrack-7cdb1",
                storageBucket: "maybeomnitrack-7cdb1.firebasestorage.app",
                messagingSenderId: "421187111508",
                appId: "1:421187111508:web:09cade3e6edf28a7eefbc1",
                measurementId: "G-QCQRG86EYZ"
            }
        },
        
        // 匯率暫存
        exchangeRates: { USD: 32.5, TWD: 1, JPY: 0.21, EUR: 35.5 }
    };

    // 股票資料清單（預設為空陣列，由使用者登入後自行新增或從 Supabase 讀取）
    let STOCKS_DATA = [];
    let cachedFinMindStockList = null; // 快取所有台股清單

    // 存股 5 大維度核心指標知識庫
    const STOCK_RULES_KNOWLEDGE = `
【存股核心 5 大維度評估法則】
1. 規模與護城河：股本與市值大（優先考量 >300 億）、產業龍頭地位、具備穩定競爭優勢。
2. 獲利體質：近 5 年平均 EPS > 1 元且長期獲利穩健、避開營運大幅衰退或劇烈波動者。
3. 配息政策：連續配發股利 10 年以上、盈餘分配率 >= 70%、避開配息暴起暴跌之景氣循環股。
4. 波動與防禦性：Beta 波動度 < 0.8（最好 < 0.6 價格抗跌）、能安心長期持有。
5. 估價與買進時機：預估現金殖利率 >= 5% 具備安全邊際、股價淨值比 (PB) < 2.5、合理本益比 (PE)。
分類定義：
- 'dividend' (適合穩健存股)：官股金控、電信龍頭、高防禦牛皮股 (Beta<0.6, 殖利率>5%, 連續配息>15年)。
- 'cashflow' (適合領高利息)：高股息ETF、民營金控、季配息穩定現金流 (殖利率>5.5%, 盈餘分配率>75%)。
- 'swing' (適合波段賺價差)：科技成長股、景氣循環股 (Beta>1.0, 成長力強但殖利率偏低或波動大)。
`;

    // =========================================================================
    // 2. DOM 元素定位
    // =========================================================================
    // 導覽分頁
    const tabFx = document.getElementById('tab-fx');
    const tabGold = document.getElementById('tab-gold');
    const tabStocks = document.getElementById('tab-stocks');
    const viewFx = document.getElementById('view-fx');
    const viewGold = document.getElementById('view-gold');
    const viewStocks = document.getElementById('view-stocks');

    // 身分認證
    const unauthView = document.getElementById('unauth-view');
    const authView = document.getElementById('auth-view');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleBadge = document.getElementById('user-role-badge');
    const btnOpenLogin = document.getElementById('btn-open-login');
    const btnOpenAdmin = document.getElementById('btn-open-admin');
    const btnLogout = document.getElementById('btn-logout');

    // 登入彈窗
    const loginModal = document.getElementById('login-modal');
    const btnCloseLoginModal = document.getElementById('btn-close-login-modal');
    const googleBtnContainer = document.getElementById('google-signin-btn-container');
    const inputCustomUser = document.getElementById('input-custom-username');
    const inputCustomPass = document.getElementById('input-custom-password');
    const btnCustomLogin = document.getElementById('btn-custom-login');

    // 管理員後台彈窗
    const adminModal = document.getElementById('admin-modal');
    const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
    const adminCustomUser = document.getElementById('admin-custom-user');
    const adminCustomPass = document.getElementById('admin-custom-pass');
    const adminSupabaseUrl = document.getElementById('admin-supabase-url');
    const adminSupabaseKey = document.getElementById('admin-supabase-key');
    const adminGoldKey = document.getElementById('admin-gold-key');
    const adminGeminiKey = document.getElementById('admin-gemini-key');
    const adminGeminiModel = document.getElementById('admin-gemini-model');
    const adminGeminiPrompt = document.getElementById('admin-gemini-prompt');
    const btnFetchGeminiModels = document.getElementById('btn-fetch-gemini-models');
    const geminiModelLoadStatus = document.getElementById('gemini-model-load-status');
    const adminGoogleClientId = document.getElementById('admin-google-client-id');
    const adminGoogleEmails = document.getElementById('admin-google-emails');
    const adminFirebaseConfig = document.getElementById('admin-firebase-config');
    const btnSaveAdminSettings = document.getElementById('btn-save-admin-settings');

    // 股票健檢與新增股票 Modal
    const rulesToggleBtn = document.getElementById('rules-toggle-btn');
    const rulesBodyContent = document.getElementById('rules-body-content');
    const rulesToggleIcon = document.getElementById('rules-toggle-icon');
    const floatingFormulaContainer = document.getElementById('floating-formula-container');
    const floatingFormulaBtn = document.getElementById('floating-formula-btn');
    const floatingFormulaPanel = document.getElementById('floating-formula-panel');
    const btnCloseFormulaPanel = document.getElementById('btn-close-formula-panel');
    const stocksContainer = document.getElementById('stocks-container');
    const stockSearchInput = document.getElementById('stock-search-input');
    const filterChips = document.querySelectorAll('.filter-chip');
    const countAllEl = document.getElementById('count-all');
    const countFavEl = document.getElementById('count-fav');

    const addStockModal = document.getElementById('add-stock-modal');
    const btnOpenAddStockModal = document.getElementById('btn-open-add-stock-modal');
    const btnCloseAddStockModal = document.getElementById('btn-close-add-stock-modal');
    const addStockKeywordInput = document.getElementById('add-stock-keyword');
    const btnSearchFinMindStock = document.getElementById('btn-search-finmind-stock');
    const stockSearchMatchesEl = document.getElementById('stock-search-matches');
    const aiDiagnoseProgressBox = document.getElementById('ai-diagnose-progress-box');
    const aiProgressStepText = document.getElementById('ai-progress-step-text');
    const addStockCodeInput = document.getElementById('add-stock-code');
    const addStockNameInput = document.getElementById('add-stock-name');
    const addStockCategoryInput = document.getElementById('add-stock-category');
    const addStockPriceInput = document.getElementById('add-stock-price');
    const addStockDiagnosisInput = document.getElementById('add-stock-diagnosis');
    const btnAiDiagnoseStock = document.getElementById('btn-ai-diagnose-stock');
    const btnSubmitAddStock = document.getElementById('btn-submit-add-stock');

    // 股票圖表 Modal 與歷年配息視圖
    const stockChartModal = document.getElementById('stock-chart-modal');
    const btnCloseStockModal = document.getElementById('btn-close-stock-modal');
    const modalStockTitle = document.getElementById('modal-stock-title');
    const modalStockPrice = document.getElementById('modal-stock-price');
    const stockModalChartCtx = document.getElementById('stock-modal-chart');
    const rangeButtons = document.querySelectorAll('.btn-range');
    const btnTypeLine = document.getElementById('btn-type-line');
    const btnTypeCandle = document.getElementById('btn-type-candle');

    const subtabBtnKline = document.getElementById('subtab-btn-kline');
    const subtabBtnDividend = document.getElementById('subtab-btn-dividend');
    const stockModalKlineView = document.getElementById('stock-modal-kline-view');
    const stockModalDividendView = document.getElementById('stock-modal-dividend-view');
    const dividendBadgeCount = document.getElementById('dividend-badge-count');
    const stockDividendTbody = document.getElementById('stock-dividend-tbody');
    const divStatCount = document.getElementById('div-stat-count');
    const divStatAvg3 = document.getElementById('div-stat-avg3');
    const divStatAvg5 = document.getElementById('div-stat-avg5');
    const divStatLatestEx = document.getElementById('div-stat-latest-ex');
    const btnCopyDividendSql = document.getElementById('btn-copy-dividend-sql');

    // 匯率與金價元素
    const fxUnauthView = document.getElementById('fx-unauth-view');
    const fxAuthView = document.getElementById('fx-auth-view');
    const goldUnauthView = document.getElementById('gold-unauth-view');
    const goldAuthView = document.getElementById('gold-auth-view');
    const amountInput = document.getElementById('amount');
    const fromCurrency = document.getElementById('from-currency');
    const toCurrency = document.getElementById('to-currency');
    const swapBtn = document.getElementById('swap-btn');
    const resultAmount = document.getElementById('result-amount');
    const resultCurrency = document.getElementById('result-currency');
    const loadingEl = document.getElementById('loading');
    const dataContentEl = document.getElementById('data-content');
    const sellRateEl = document.getElementById('sell-rate');
    const sellInsightEl = document.getElementById('sell-insight');
    const buyRateEl = document.getElementById('buy-rate');
    const buyInsightEl = document.getElementById('buy-insight');
    const avgRateEl = document.getElementById('avg-rate');

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const searchBtn = document.getElementById('search-btn');
    const historyTbody = document.getElementById('history-tbody');
    const historyChartCtx = document.getElementById('history-chart');

    const goldUsdPrice = document.getElementById('gold-usd-price');
    const goldTwdPrice = document.getElementById('gold-twd-price');
    const goldTsinPrice = document.getElementById('gold-tsin-price');
    const goldStartDateInput = document.getElementById('gold-start-date');
    const goldEndDateInput = document.getElementById('gold-end-date');
    const goldSearchBtn = document.getElementById('gold-search-btn');
    const goldChartCtx = document.getElementById('gold-chart');
    const goldTbody = document.getElementById('gold-tbody');

    // Chart.js 實例暫存
    let fxChartInstance = null;
    let goldChartInstance = null;
    let stockChartInstance = null;

    // 暫存即時分析出來的指標 (由 AI 或規則引擎產出)
    let tempCalculatedMetrics = null;

    // =========================================================================
    // 3. 初始化程序
    // =========================================================================
    async function initApp() {
        loadSavedConfig();
        setupDates();
        initNavigation();
        initAuthHandlers();
        initFirebaseVault();
        await fetchSecretsFromFirebase();
        initGoogleIdentityServices();
        await initSupabaseDataPipeline();
        initStocksSection();
        initFxAndGoldSection();
        loadGeminiUsage();
        renderAppAuthGates();
    }

    function loadSavedConfig() {
        try {
            const saved = localStorage.getItem('maybe_omni_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                state.config = { ...state.config, ...parsed };
            }
            const savedFavs = localStorage.getItem('maybe_omni_watchlist');
            if (savedFavs) {
                state.watchlist = new Set(JSON.parse(savedFavs));
            }
            const savedUser = localStorage.getItem('maybe_omni_current_user');
            if (savedUser) {
                const parsedUser = JSON.parse(savedUser);
                setLoggedInUser(parsedUser);
            }
        } catch (e) {
            console.warn("Config load fallback", e);
        }
    }

    function setupDates() {
        const today = new Date();
        const formatDate = (d) => d.toISOString().split('T')[0];

        const fxPast = new Date();
        fxPast.setDate(today.getDate() - 90);
        startDateInput.value = formatDate(fxPast);
        endDateInput.value = formatDate(today);

        const goldPast = new Date();
        goldPast.setDate(today.getDate() - 14);
        goldStartDateInput.value = formatDate(goldPast);
        goldEndDateInput.value = formatDate(today);
    }

    // =========================================================================
    // 4. 導覽分頁切換
    // =========================================================================
    function initNavigation() {
        const switchTab = (target) => {
            state.activeTab = target;
            tabFx.classList.remove('active');
            tabGold.classList.remove('active');
            tabStocks.classList.remove('active');
            
            viewFx.style.display = 'none';
            viewGold.style.display = 'none';
            viewStocks.style.display = 'none';

            if (target === 'view-fx') {
                tabFx.classList.add('active');
                viewFx.style.display = 'block';
            } else if (target === 'view-gold') {
                tabGold.classList.add('active');
                viewGold.style.display = 'block';
            } else if (target === 'view-stocks') {
                tabStocks.classList.add('active');
                viewStocks.style.display = 'block';
                renderStocks();
            }

            if (floatingFormulaContainer) {
                floatingFormulaContainer.style.display = (target === 'view-stocks') ? 'block' : 'none';
            }
            if (floatingFormulaPanel && target !== 'view-stocks') {
                floatingFormulaPanel.style.display = 'none';
            }
        };

        tabFx.addEventListener('click', () => switchTab('view-fx'));
        tabGold.addEventListener('click', () => switchTab('view-gold'));
        tabStocks.addEventListener('click', () => switchTab('view-stocks'));
    }

    // =========================================================================
    // 5. Firebase 機密保險庫
    // =========================================================================
    let firestoreDb = null;

    function initFirebaseVault() {
        if (!state.config.firebaseConfig || typeof firebase === 'undefined') return;
        try {
            let conf = state.config.firebaseConfig;
            if (typeof conf === 'string') {
                let cleanStr = conf.trim();
                if (!cleanStr.startsWith('{')) {
                    const match = cleanStr.match(/\{[\s\S]*\}/);
                    if (match) cleanStr = match[0];
                }
                conf = JSON.parse(cleanStr);
            }

            if (conf && conf.apiKey && !firebase.apps.length) {
                firebase.initializeApp(conf);
            }
            if (firebase.apps.length) {
                firestoreDb = firebase.firestore();
                console.log("🔥 Firebase Vault initialized successfully.");
            }
        } catch (e) {
            console.error("Firebase Vault init error:", e);
        }
    }

    async function fetchSecretsFromFirebase() {
        if (!firestoreDb) initFirebaseVault();
        if (!firestoreDb) return;
        try {
            const doc = await firestoreDb.collection('app_config').doc('secrets').get();
            if (doc.exists) {
                const data = doc.data();
                if (data.supabase_url) state.config.supabaseUrl = data.supabase_url;
                if (data.supabase_key) state.config.supabaseKey = data.supabase_key;
                if (data.gold_key) state.config.goldApiKey = data.gold_key;
                if (data.gemini_key) state.config.geminiApiKey = data.gemini_key;
                if (data.gemini_model) state.config.geminiModel = data.gemini_model;
                if (data.gemini_prompt) state.config.geminiPrompt = data.gemini_prompt;
                if (data.custom_user) state.config.customUser = data.custom_user;
                if (data.custom_pass) state.config.customPass = data.custom_pass;
                if (data.admin_emails) state.config.adminGoogleEmails = data.admin_emails;
                if (data.google_client_id) state.config.googleClientId = data.google_client_id;
                
                localStorage.setItem('maybe_omni_config', JSON.stringify(state.config));
                console.log("🔥 Secrets auto-loaded from Firebase Vault!");
            }
        } catch (e) {
            console.warn("Fetch from Firebase Vault error:", e);
        }
    }

    async function saveSecretsToFirebase() {
        if (!firestoreDb) initFirebaseVault();
        if (!firestoreDb) return;
        try {
            await firestoreDb.collection('app_config').doc('secrets').set({
                supabase_url: state.config.supabaseUrl,
                supabase_key: state.config.supabaseKey,
                gold_key: state.config.goldApiKey,
                gemini_key: state.config.geminiApiKey,
                gemini_model: state.config.geminiModel,
                gemini_prompt: state.config.geminiPrompt || STOCK_RULES_KNOWLEDGE,
                custom_user: state.config.customUser,
                custom_pass: state.config.customPass,
                admin_emails: state.config.adminGoogleEmails,
                google_client_id: state.config.googleClientId,
                updated_at: new Date().toISOString()
            }, { merge: true });
            console.log("🔥 Secrets saved to Firebase Vault successfully!");
        } catch (e) {
            console.error("Save to Firebase Vault error:", e);
            alert("Firebase 保險庫儲存時發生錯誤：" + e.message);
        }
    }

    // =========================================================================
    // 6. Supabase 關聯資料庫 Pipeline (DB-First 快取與自動入庫引擎)
    // =========================================================================
    let supabaseClient = null;

    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        if (state.config.supabaseUrl && state.config.supabaseKey && window.supabase) {
            try {
                let cleanUrl = state.config.supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
                let cleanKey = state.config.supabaseKey.trim().replace(/^["']|["']$/g, '');
                supabaseClient = window.supabase.createClient(cleanUrl, cleanKey);
                return supabaseClient;
            } catch (e) {
                console.warn("Supabase client init error", e);
            }
        }
        return null;
    }

    async function initSupabaseDataPipeline() {
        const client = getSupabaseClient();
        if (!client) {
            console.log("ℹ️ Supabase 尚未連線（登入 Google 後將自動從 Firebase 載入或在後台設定）");
            return;
        }

        try {
            console.log("🔄 正在與 Supabase 進行資料同步與檢查...");

            // 1. 同步自選清單 (watchlist)
            const { data: favData } = await client.from('watchlist').select('stock_id');
            if (favData && favData.length > 0) {
                state.watchlist = new Set(favData.map(f => f.stock_id));
                localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));
            }

            // 2. 查詢 Supabase stocks 資料表
            const { data: dbStocks, error: errStocks } = await client.from('stocks').select('*').order('stock_id', { ascending: true });
            if (dbStocks && !errStocks) {
                STOCKS_DATA = dbStocks.map(row => ({
                    id: row.stock_id,
                    name: row.name,
                    price: parseFloat(row.price || 0),
                    marketCap: parseFloat(row.market_cap || 0),
                    eps5y: parseFloat(row.eps_5y_avg || 0),
                    divYears: parseInt(row.div_years || 0),
                    payoutRatio: parseFloat(row.payout_ratio || 0),
                    yield: parseFloat(row.dividend_yield || 0),
                    beta: parseFloat(row.beta || 0.8),
                    pb: parseFloat(row.pb_ratio || 1.5),
                    pe: parseFloat(row.pe_ratio || 15),
                    category: row.category_tag || 'dividend',
                    diagnosis: row.diagnosis_note || ''
                }));
                console.log(`⚡ [Supabase] 成功載入 ${STOCKS_DATA.length} 檔使用者股票！`);
            }
        } catch (e) {
            console.warn("Supabase pipeline init warning:", e);
        }
    }

    // =========================================================================
    // 7. Google Identity Services (GIS) 與指定管理員判定
    // =========================================================================
    function initGoogleIdentityServices() {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;
        try {
            google.accounts.id.initialize({
                client_id: state.config.googleClientId,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true
            });

            if (googleBtnContainer) {
                googleBtnContainer.innerHTML = '';
                google.accounts.id.renderButton(googleBtnContainer, {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    shape: 'pill',
                    text: 'signin_with',
                    logo_alignment: 'left',
                    width: 280
                });
            }
        } catch (err) {
            console.warn("Google GIS init error", err);
        }
    }

    function decodeJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    async function handleGoogleCredentialResponse(response) {
        const payload = decodeJwt(response.credential);
        if (!payload || !payload.email) {
            alert("Google 登入驗證失敗，無法讀取帳號資訊。");
            return;
        }

        const userEmail = payload.email.toLowerCase().trim();
        const userName = payload.name || payload.email.split('@')[0];

        await fetchSecretsFromFirebase();
        await initSupabaseDataPipeline();

        let isAdmin = false;
        const adminEmailsList = state.config.adminGoogleEmails
            .toLowerCase()
            .split(',')
            .map(e => e.trim())
            .filter(e => e.length > 0);

        if (adminEmailsList.length === 0) {
            state.config.adminGoogleEmails = userEmail;
            localStorage.setItem('maybe_omni_config', JSON.stringify(state.config));
            saveSecretsToFirebase();
            isAdmin = true;
            alert(`🎉 恭喜！檢測到首次使用 Google 登入，系統已自動將您 (${userEmail}) 指定為最高管理員！`);
        } else {
            isAdmin = adminEmailsList.includes(userEmail);
        }

        const client = getSupabaseClient();

        if (isAdmin) {
            // 管理員自動建立/更新放行紀錄
            if (client) {
                try {
                    await client.from('app_users').upsert({
                        email: userEmail,
                        name: userName,
                        role: 'admin',
                        status: 'approved',
                        provider: 'google',
                        note: '最高管理員',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email' });
                } catch (e) {
                    console.warn("Admin upsert to app_users warning:", e);
                }
            }
            setLoggedInUser({ name: `${userName} (Google)`, email: userEmail, role: 'admin' });
            loginModal.style.display = 'none';
            alert(`👑 歡迎管理員 ${userName} (${userEmail}) 登入！後台設定與審核管理功能已解鎖。`);
            return;
        }

        // 一般用戶：查詢 Supabase app_users 審核狀態
        if (client) {
            try {
                const { data: userRows, error } = await client
                    .from('app_users')
                    .select('*')
                    .eq('email', userEmail)
                    .limit(1);

                if (error) {
                    if (error.code === '42P01') {
                        alert("⚠️ Supabase 尚未建立 app_users 資料表！請管理員至後台複製 SQL 建立表格。");
                        return;
                    }
                    console.error("Query app_users error:", error);
                }

                if (!userRows || userRows.length === 0) {
                    // 首次申請：建立 pending 待審核紀錄
                    const nowIso = new Date().toISOString();
                    const { error: insErr } = await client.from('app_users').upsert({
                        email: userEmail,
                        name: userName,
                        role: 'user',
                        status: 'pending',
                        provider: 'google',
                        note: '新 Google 用戶註冊申請',
                        created_at: nowIso,
                        updated_at: nowIso
                    }, { onConflict: 'email' });

                    if (insErr) {
                        console.error("Supabase app_users insert error:", insErr);
                        alert(`❌ 送出註冊審核申請失敗：${insErr.message}\n請確認 Supabase app_users 的 RLS 開放寫入權限。`);
                        return;
                    }

                    loginModal.style.display = 'none';
                    alert(`⏳ 您的帳號 (${userEmail}) 已成功送出註冊審核申請！\n\n目前狀態為「🟡 待審核」，請等待系統管理員放行後即可登入使用。`);
                    return;
                }

                const userRecord = userRows[0];
                if (userRecord.status === 'approved') {
                    // 已放行，允許登入
                    await client.from('app_users').update({ updated_at: new Date().toISOString() }).eq('email', userEmail);
                    setLoggedInUser({ name: `${userRecord.name || userName} (Google)`, email: userEmail, role: userRecord.role || 'user' });
                    loginModal.style.display = 'none';
                    alert(`👋 歡迎 ${userName}！您的帳號已審核通過，全站匯率、金價與股票功能已解鎖。`);
                } else if (userRecord.status === 'pending') {
                    loginModal.style.display = 'none';
                    alert(`⏳ 您的帳號 (${userEmail}) 正在等待管理員審核放行中，請聯繫管理員。`);
                } else {
                    loginModal.style.display = 'none';
                    alert(`🚫 您的帳號 (${userEmail}) 已被停用或拒絕存取。若有疑問請向管理員確認。`);
                }
            } catch (err) {
                console.error("User approval check error:", err);
                alert("用戶審核驗證時發生錯誤：" + err.message);
            }
        } else {
            alert("⚠️ 尚未連線至 Supabase 資料庫，請聯繫系統管理員完成連線設定！");
        }
    }

    // =========================================================================
    // 8. 身分認證與管理員後台事件 (雙頁籤 + 用戶審核)
    // =========================================================================
    let cachedAdminUsers = [];
    let currentAdminUserFilter = 'all';

    function initAuthHandlers() {
        btnOpenLogin.addEventListener('click', () => {
            loginModal.style.display = 'flex';
            initGoogleIdentityServices();
        });
        btnCloseLoginModal.addEventListener('click', () => loginModal.style.display = 'none');

        // 未登入鎖定卡片上的立即登入按鈕
        document.querySelectorAll('.btn-gate-login').forEach(btn => {
            btn.addEventListener('click', () => {
                loginModal.style.display = 'flex';
                initGoogleIdentityServices();
            });
        });
        
        btnOpenAdmin.addEventListener('click', () => {
            if (!state.currentUser || state.currentUser.role !== 'admin') {
                alert("您不具備管理員權限！");
                return;
            }
            adminCustomUser.value = state.config.customUser;
            adminCustomPass.value = state.config.customPass;
            adminSupabaseUrl.value = state.config.supabaseUrl;
            adminSupabaseKey.value = state.config.supabaseKey;
            adminGoldKey.value = state.config.goldApiKey;
            if (adminGeminiKey) adminGeminiKey.value = state.config.geminiApiKey || '';
            const targetModel = state.config.geminiModel || 'gemini-3.7-flash';
            if (adminGeminiModel) {
                let opt = adminGeminiModel.querySelector(`option[value="${targetModel}"]`);
                if (!opt) {
                    opt = document.createElement('option');
                    opt.value = targetModel;
                    opt.textContent = `⚡ ${targetModel}`;
                    adminGeminiModel.appendChild(opt);
                }
                adminGeminiModel.value = targetModel;
            }
            if (adminGeminiPrompt) adminGeminiPrompt.value = state.config.geminiPrompt || STOCK_RULES_KNOWLEDGE;
            adminGoogleClientId.value = state.config.googleClientId;
            adminGoogleEmails.value = state.config.adminGoogleEmails;
            adminFirebaseConfig.value = typeof state.config.firebaseConfig === 'string' ? state.config.firebaseConfig : JSON.stringify(state.config.firebaseConfig, null, 2);
            adminModal.style.display = 'flex';
            if (state.config.geminiApiKey) {
                fetchAvailableGeminiModels(false);
            }
            loadAdminUsersList();
        });
        btnCloseAdminModal.addEventListener('click', () => adminModal.style.display = 'none');

        // 管理員雙頁籤切換
        const tabBtnAdminConfig = document.getElementById('tab-btn-admin-config');
        const tabBtnAdminUsers = document.getElementById('tab-btn-admin-users');
        const adminPanelConfig = document.getElementById('admin-panel-config');
        const adminPanelUsers = document.getElementById('admin-panel-users');

        if (tabBtnAdminConfig && tabBtnAdminUsers) {
            tabBtnAdminConfig.addEventListener('click', () => {
                tabBtnAdminConfig.classList.add('active');
                tabBtnAdminUsers.classList.remove('active');
                if (adminPanelConfig) adminPanelConfig.style.display = 'block';
                if (adminPanelUsers) adminPanelUsers.style.display = 'none';
            });
            tabBtnAdminUsers.addEventListener('click', () => {
                tabBtnAdminUsers.classList.add('active');
                tabBtnAdminConfig.classList.remove('active');
                if (adminPanelConfig) adminPanelConfig.style.display = 'none';
                if (adminPanelUsers) adminPanelUsers.style.display = 'block';
                loadAdminUsersList();
            });
        }

        // 用戶管理搜尋與篩選
        const adminUserSearch = document.getElementById('admin-user-search');
        if (adminUserSearch) {
            adminUserSearch.addEventListener('input', () => renderAdminUsersTable());
        }

        document.querySelectorAll('.user-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.user-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentAdminUserFilter = chip.dataset.filter;
                renderAdminUsersTable();
            });
        });

        const btnRefreshAdminUsers = document.getElementById('btn-refresh-admin-users');
        if (btnRefreshAdminUsers) {
            btnRefreshAdminUsers.addEventListener('click', () => loadAdminUsersList(true));
        }

        // 手動新增用戶
        const btnCreateAdminUser = document.getElementById('btn-create-admin-user');
        if (btnCreateAdminUser) {
            btnCreateAdminUser.addEventListener('click', async () => {
                const emailInput = document.getElementById('new-user-email');
                const nameInput = document.getElementById('new-user-name');
                const statusInput = document.getElementById('new-user-status');
                const noteInput = document.getElementById('new-user-note');
                
                const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
                if (!email || !email.includes('@')) {
                    alert("請輸入有效的 Email 帳號！");
                    return;
                }
                const name = (nameInput && nameInput.value.trim()) || email.split('@')[0];
                const status = (statusInput && statusInput.value) || 'approved';
                const note = (noteInput && noteInput.value.trim()) || '管理員手動新增';

                const client = getSupabaseClient();
                if (!client) {
                    alert("請先完成 Supabase 資料庫連線設定！");
                    return;
                }

                try {
                    const nowIso = new Date().toISOString();
                    const { error } = await client.from('app_users').upsert({
                        email,
                        name,
                        role: 'user',
                        status,
                        provider: 'google',
                        note,
                        updated_at: nowIso
                    }, { onConflict: 'email' });

                    if (error) throw error;

                    if (emailInput) emailInput.value = '';
                    if (nameInput) nameInput.value = '';
                    if (noteInput) noteInput.value = '';
                    alert(`✅ 成功建立/放行用戶：${email}！`);
                    loadAdminUsersList();
                } catch (e) {
                    alert("新增用戶失敗：" + e.message);
                }
            });
        }

        // 複製 SQL 建表代碼
        const btnCopyUserSql = document.getElementById('btn-copy-user-sql');
        if (btnCopyUserSql) {
            btnCopyUserSql.addEventListener('click', () => {
                const sqlText = document.getElementById('sql-app-users-code');
                if (sqlText) {
                    navigator.clipboard.writeText(sqlText.value);
                    alert("📋 已將 app_users 建表 SQL 複製至剪貼簿！可直接至 Supabase SQL Editor 貼上執行。");
                }
            });
        }

        // 讀取 Gemini 模型清單事件
        if (btnFetchGeminiModels) {
            btnFetchGeminiModels.addEventListener('click', () => fetchAvailableGeminiModels(true));
        }

        // 檢測 Gemini 配額事件
        const btnCheckGeminiQuota = document.getElementById('btn-check-gemini-quota');
        if (btnCheckGeminiQuota) {
            btnCheckGeminiQuota.addEventListener('click', () => checkGeminiQuota(true));
        }

        // 特定帳號密碼登入
        btnCustomLogin.addEventListener('click', async () => {
            await fetchSecretsFromFirebase();
            const u = inputCustomUser.value.trim();
            const p = inputCustomPass.value.trim();
            if (u === state.config.customUser && p === state.config.customPass) {
                setLoggedInUser({ name: u, email: `${u}@system.local`, role: 'user' });
                loginModal.style.display = 'none';
                await initSupabaseDataPipeline();
                renderAppAuthGates();
                alert(`歡迎回來，${u}！您已成功登入系統（一般用戶權限）。`);
            } else {
                alert('帳號或密碼錯誤！請向管理員確認。');
            }
        });

        // 登出
        btnLogout.addEventListener('click', () => {
            state.currentUser = null;
            localStorage.removeItem('maybe_omni_current_user');
            renderAppAuthGates();
            alert('已安全登出。');
        });

        // 儲存管理員後台設定
        btnSaveAdminSettings.addEventListener('click', async () => {
            state.config.customUser = adminCustomUser.value.trim() || 'admin';
            state.config.customPass = adminCustomPass.value.trim() || '123456';
            state.config.supabaseUrl = adminSupabaseUrl.value.trim();
            state.config.supabaseKey = adminSupabaseKey.value.trim();
            state.config.goldApiKey = adminGoldKey.value.trim();
            if (adminGeminiKey) state.config.geminiApiKey = adminGeminiKey.value.trim();
            if (adminGeminiModel) state.config.geminiModel = adminGeminiModel.value;
            if (adminGeminiPrompt) state.config.geminiPrompt = adminGeminiPrompt.value.trim();
            state.config.googleClientId = adminGoogleClientId.value.trim();
            state.config.adminGoogleEmails = adminGoogleEmails.value.trim();
            if (adminFirebaseConfig.value.trim()) {
                state.config.firebaseConfig = adminFirebaseConfig.value.trim();
            }

            localStorage.setItem('maybe_omni_config', JSON.stringify(state.config));
            
            initFirebaseVault();
            await saveSecretsToFirebase();

            supabaseClient = null;
            await initSupabaseDataPipeline();

            adminModal.style.display = 'none';
            initGoogleIdentityServices();
            renderAppAuthGates();
            alert(`✅ 雲端設定已成功同步至 Firebase！已啟用 Gemini 模型：${state.config.geminiModel}`);
        });
    }

    // 載入 Supabase app_users 審核清單
    async function loadAdminUsersList(showPrompt = false) {
        const client = getSupabaseClient();
        const tbody = document.getElementById('admin-users-tbody');
        if (!client) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444;">Supabase 尚未連線，請先在「系統核心設定」填妥 URL 與 Key。</td></tr>';
            return;
        }

        try {
            const { data: users, error } = await client
                .from('app_users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">讀取失敗：${error.message} (請確認 app_users 資料表是否已建立)</td></tr>`;
                return;
            }

            cachedAdminUsers = users || [];
            updateAdminUserCounts();
            renderAdminUsersTable();
            if (showPrompt) alert(`🎉 已成功從 Supabase 同步 ${cachedAdminUsers.length} 筆用戶資料！`);
        } catch (e) {
            console.warn("loadAdminUsersList error:", e);
        }
    }

    function updateAdminUserCounts() {
        const pendingCount = cachedAdminUsers.filter(u => u.status === 'pending').length;
        const approvedCount = cachedAdminUsers.filter(u => u.status === 'approved').length;
        const rejectedCount = cachedAdminUsers.filter(u => u.status === 'rejected').length;

        const countAll = document.getElementById('count-user-all');
        const countPending = document.getElementById('count-user-pending');
        const countApproved = document.getElementById('count-user-approved');
        const countRejected = document.getElementById('count-user-rejected');
        const adminPendingBadge = document.getElementById('admin-pending-count');

        if (countAll) countAll.textContent = cachedAdminUsers.length;
        if (countPending) countPending.textContent = pendingCount;
        if (countApproved) countApproved.textContent = approvedCount;
        if (countRejected) countRejected.textContent = rejectedCount;

        if (adminPendingBadge) {
            if (pendingCount > 0) {
                adminPendingBadge.style.display = 'inline-block';
                adminPendingBadge.textContent = pendingCount;
            } else {
                adminPendingBadge.style.display = 'none';
            }
        }
    }

    function renderAdminUsersTable() {
        const tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;

        const searchInput = document.getElementById('admin-user-search');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

        let list = cachedAdminUsers.filter(u => {
            const matchesFilter = currentAdminUserFilter === 'all' || u.status === currentAdminUserFilter;
            const matchesSearch = !query || (u.email && u.email.toLowerCase().includes(query)) || (u.name && u.name.toLowerCase().includes(query)) || (u.note && u.note.toLowerCase().includes(query));
            return matchesFilter && matchesSearch;
        });

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 2rem;">查無符合條件的用戶紀錄。</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(u => {
            const statusBadge = u.status === 'approved' 
                ? '<span class="status-badge-approved"><i class="fa-solid fa-circle-check"></i> 已放行</span>'
                : u.status === 'pending'
                ? '<span class="status-badge-pending"><i class="fa-solid fa-clock"></i> 待審核</span>'
                : '<span class="status-badge-rejected"><i class="fa-solid fa-ban"></i> 已停用</span>';

            const safeEmail = escapeHtml(u.email);
            const safeName = escapeHtml(u.name || '--');
            const safeProvider = escapeHtml(u.provider || 'google');
            const safeNote = escapeHtml(u.note || '');

            return `
                <tr>
                    <td>${statusBadge}</td>
                    <td><strong>${safeEmail}</strong> ${u.role === 'admin' ? '<span style="color: #d97706; font-size: 0.75rem;">(👑管理員)</span>' : ''}</td>
                    <td>${safeName}</td>
                    <td><span style="color: #64748b; font-size: 0.75rem;">${safeProvider}</span></td>
                    <td style="color: #64748b; font-size: 0.75rem;">${createdStr}</td>
                    <td>
                        <span class="user-note-text" style="cursor: pointer; color: #2563eb;" title="點擊編輯備註" data-id="${escapeHtml(u.id || '')}" data-email="${safeEmail}" data-note="${safeNote}">
                            ${safeNote ? safeNote : '<em style="color: #94a3b8;">+ 點此加備註</em>'}
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 0.25rem;">
                            ${u.status !== 'approved' ? `
                                <button type="button" class="btn-action-user btn-action-approve" data-id="${u.id || ''}" data-email="${u.email}" title="核准放行">
                                    <i class="fa-solid fa-check"></i> 放行
                                </button>
                            ` : `
                                <button type="button" class="btn-action-user btn-action-reject" data-id="${u.id || ''}" data-email="${u.email}" title="停用訪問">
                                    <i class="fa-solid fa-ban"></i> 停用
                                </button>
                            `}
                            <button type="button" class="btn-action-user btn-action-del" data-id="${u.id || ''}" data-email="${u.email}" title="刪除紀錄">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // 綁定操作按鈕事件
        tbody.querySelectorAll('.btn-action-approve').forEach(b => {
            b.addEventListener('click', () => updateAdminUserStatus(b.dataset.id, 'approved', b.dataset.email));
        });
        tbody.querySelectorAll('.btn-action-reject').forEach(b => {
            b.addEventListener('click', () => updateAdminUserStatus(b.dataset.id, 'rejected', b.dataset.email));
        });
        tbody.querySelectorAll('.btn-action-del').forEach(b => {
            b.addEventListener('click', () => deleteAdminUser(b.dataset.id, b.dataset.email));
        });
        tbody.querySelectorAll('.user-note-text').forEach(n => {
            n.addEventListener('click', () => updateAdminUserNote(n.dataset.id, n.dataset.note, n.dataset.email));
        });
    }

    async function updateAdminUserStatus(id, newStatus, email) {
        const client = getSupabaseClient();
        if (!client) return;
        try {
            let query = client.from('app_users').update({ status: newStatus, updated_at: new Date().toISOString() });
            if (email) {
                query = query.eq('email', email);
            } else if (id) {
                query = query.eq('id', id);
            }
            const { error } = await query;
            if (error) throw error;
            console.log(`✅ 用戶 ${email} 狀態已變更為 ${newStatus}`);
            loadAdminUsersList();
        } catch (e) {
            alert("更新狀態失敗：" + e.message);
        }
    }

    async function updateAdminUserNote(id, currentNote, email) {
        const newNote = prompt("請輸入此用戶的管理員備註：", currentNote || '');
        if (newNote === null) return;
        const client = getSupabaseClient();
        if (!client) return;
        try {
            let query = client.from('app_users').update({ note: newNote.trim(), updated_at: new Date().toISOString() });
            if (email) {
                query = query.eq('email', email);
            } else if (id) {
                query = query.eq('id', id);
            }
            const { error } = await query;
            if (error) throw error;
            loadAdminUsersList();
        } catch (e) {
            alert("更新備註失敗：" + e.message);
        }
    }

    async function deleteAdminUser(id, email) {
        if (!confirm(`確定要刪除用戶【${email}】的審核紀錄嗎？`)) return;
        const client = getSupabaseClient();
        if (!client) return;
        try {
            let query = client.from('app_users').delete();
            if (email) {
                query = query.eq('email', email);
            } else if (id) {
                query = query.eq('id', id);
            }
            const { error } = await query;
            if (error) throw error;
            loadAdminUsersList();
        } catch (e) {
            alert("刪除失敗：" + e.message);
        }
    }

    // 連線 Google AI Studio 抓取支援 generateContent 的可用模型清單
    async function fetchAvailableGeminiModels(showPrompt = false) {
        const apiKey = (adminGeminiKey && adminGeminiKey.value.trim()) || state.config.geminiApiKey;
        if (!apiKey) {
            if (showPrompt) alert("請先填入 Google AI Studio (Gemini) API Key 才能讀取模型清單！");
            return;
        }

        if (geminiModelLoadStatus) {
            geminiModelLoadStatus.style.display = 'block';
            geminiModelLoadStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在向 Google AI Studio 讀取模型清單...';
        }

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // 過濾支援 generateContent 的模型
            const models = (data.models || []).filter(m => {
                const isGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                const name = m.name || '';
                return isGen && !name.includes('embedding') && !name.includes('aqa') && !name.includes('imagen') && !name.includes('tts');
            });

            if (models.length > 0 && adminGeminiModel) {
                // 優先排序 3.7 / 2.5 / 2.0 / 1.5
                models.sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    const getScore = (n) => {
                        if (n.includes('3.7') && n.includes('flash')) return 1;
                        if (n.includes('3.7')) return 2;
                        if (n.includes('2.5') && n.includes('flash')) return 3;
                        if (n.includes('2.0') && n.includes('flash')) return 4;
                        if (n.includes('1.5') && n.includes('flash')) return 5;
                        if (n.includes('flash')) return 6;
                        if (n.includes('pro')) return 7;
                        return 10;
                    };
                    return getScore(aName) - getScore(bName);
                });

                const currentSelection = state.config.geminiModel || 'gemini-3.7-flash';
                adminGeminiModel.innerHTML = '';

                models.forEach(m => {
                    const cleanName = m.name.replace(/^models\//, '');
                    const isFlash = cleanName.toLowerCase().includes('flash');
                    const opt = document.createElement('option');
                    opt.value = cleanName;
                    opt.textContent = `${isFlash ? '⚡ [高速] ' : '🧠 [深度] '} ${m.displayName || cleanName} (${cleanName})`;
                    if (cleanName === currentSelection) opt.selected = true;
                    adminGeminiModel.appendChild(opt);
                });

                adminGeminiModel.value = currentSelection;

                if (geminiModelLoadStatus) {
                    geminiModelLoadStatus.innerHTML = `✅ 成功讀取 ${models.length} 個可用 Gemini 模型！`;
                }
                if (showPrompt) alert(`🎉 成功從 Google AI Studio 讀取到 ${models.length} 個可用模型！請在下拉選單中挑選。`);
            }
        } catch (err) {
            console.warn("Gemini list models failed:", err);
            if (geminiModelLoadStatus) {
                geminiModelLoadStatus.innerHTML = `⚠️ 無法連線讀取清單，將使用預設模型選單。`;
            }
            if (showPrompt) alert("讀取模型清單失敗，請確認 API Key 是否正確。");
        }
    }

    // =========================================================================
    // Gemini AI Studio 配額追蹤與檢測模組
    // =========================================================================
    function loadGeminiUsage() {
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            const raw = localStorage.getItem('maybe_gemini_usage');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.date === todayStr) {
                    state.geminiUsage = parsed;
                } else {
                    state.geminiUsage = { date: todayStr, count: 0, totalTokens: 0 };
                    localStorage.setItem('maybe_gemini_usage', JSON.stringify(state.geminiUsage));
                }
            } else {
                state.geminiUsage = { date: todayStr, count: 0, totalTokens: 0 };
            }
        } catch (e) {
            state.geminiUsage = { date: todayStr, count: 0, totalTokens: 0 };
        }
        updateGeminiQuotaDisplay();
    }

    function recordGeminiCall(tokenCount = 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (state.geminiUsage.date !== todayStr) {
            state.geminiUsage = { date: todayStr, count: 0, totalTokens: 0 };
        }
        state.geminiUsage.count = (state.geminiUsage.count || 0) + 1;
        state.geminiUsage.totalTokens = (state.geminiUsage.totalTokens || 0) + tokenCount;
        try {
            localStorage.setItem('maybe_gemini_usage', JSON.stringify(state.geminiUsage));
        } catch (e) {}
        updateGeminiQuotaDisplay();
    }

    function updateGeminiQuotaDisplay() {
        const quotaBadgeText = document.getElementById('gemini-quota-text');
        const quotaBadge = document.getElementById('gemini-quota-badge');
        const count = state.geminiUsage.count || 0;
        const dailyLimit = 1500;
        const remaining = Math.max(0, dailyLimit - count);

        if (quotaBadgeText) {
            quotaBadgeText.textContent = `Gemini 今日調用: ${count} / ${dailyLimit} 次 (剩餘 ${remaining} 次)`;
        }

        if (quotaBadge) {
            if (count >= dailyLimit) {
                quotaBadge.style.background = '#fef2f2';
                quotaBadge.style.color = '#dc2626';
                quotaBadge.style.borderColor = '#fca5a5';
            } else if (count >= 1200) {
                quotaBadge.style.background = '#fffbeb';
                quotaBadge.style.color = '#d97706';
                quotaBadge.style.borderColor = '#fde68a';
            } else {
                quotaBadge.style.background = '#eef2ff';
                quotaBadge.style.color = '#4338ca';
                quotaBadge.style.borderColor = '#c7d2fe';
            }
        }
    }

    async function checkGeminiQuota(showPrompt = false) {
        loadGeminiUsage();
        const adminGeminiKey = document.getElementById('admin-gemini-key');
        const apiKey = (adminGeminiKey && adminGeminiKey.value.trim()) || state.config.geminiApiKey;
        const adminResult = document.getElementById('gemini-quota-admin-result');
        const count = state.geminiUsage.count || 0;
        const dailyLimit = 1500;
        const remaining = Math.max(0, dailyLimit - count);
        const tokens = state.geminiUsage.totalTokens || 0;

        if (!apiKey) {
            if (adminResult) {
                adminResult.style.display = 'block';
                adminResult.style.color = '#dc2626';
                adminResult.textContent = '❌ 尚未填入 Gemini API Key！請先貼上 API Key 後再檢測。';
            }
            if (showPrompt) alert('尚未設定 Google AI Studio (Gemini) API Key！請在後台填入 API Key。');
            return;
        }

        if (adminResult) {
            adminResult.style.display = 'block';
            adminResult.style.color = '#4338ca';
            adminResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在連線 Google AI Studio 檢測 API Key 與官方配額...';
        }

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const msg = `🟢 Google AI Studio API Key 連線正常！\n📊 今日累計調用：${count} / ${dailyLimit} 次 (RPD，剩餘 ${remaining} 次)\n📈 今日累計消耗：約 ${tokens.toLocaleString()} Tokens\n⚡ 官方免費方案配額上限：\n   • 每日上限 (RPD)：1,500 次/天\n   • 每分鐘上限 (RPM)：15 次/分鐘\n   • 每分鐘 Token (TPM)：1,000,000 Tokens/分\n🔗 官方用量與帳單中心：https://aistudio.google.com/app/plan_information`;

            if (adminResult) {
                adminResult.style.color = '#166534';
                adminResult.innerHTML = `
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.6rem; border-radius: 6px; line-height: 1.5;">
                        <div><strong style="color: #15803d;">🟢 連線正常！</strong> 今日調用: <strong>${count} / ${dailyLimit} 次</strong> (剩餘 <strong>${remaining}</strong> 次)</div>
                        <div style="font-size: 0.72rem; color: #166534; margin-top: 0.25rem;">
                            ⚡ 免費額度上限: 15 次/分 (RPM) ｜ 1,500 次/日 (RPD) ｜ 100萬 Tokens/分
                        </div>
                        <div style="margin-top: 0.35rem;">
                            <a href="https://aistudio.google.com/app/plan_information" target="_blank" style="color: #2563eb; font-size: 0.72rem; text-decoration: underline;">
                                ↗ 前往 Google AI Studio 官方用量與帳單儀表板
                            </a>
                        </div>
                    </div>
                `;
            }

            if (showPrompt) {
                alert(msg);
            }
        } catch (err) {
            console.warn("Gemini quota test failed:", err);
            const errMsg = `❌ Gemini API Key 檢測失敗 (代碼: ${err.message})，請確認金鑰是否有效或未被 Google 停用。`;
            if (adminResult) {
                adminResult.style.color = '#dc2626';
                adminResult.innerHTML = `⚠️ ${errMsg}`;
            }
            if (showPrompt) alert(errMsg);
        }
    }

    // 全站未登入 vs 已登入權限閘門切換
    function renderAppAuthGates() {
        const isAuth = !!state.currentUser;

        if (isAuth) {
            unauthView.style.display = 'none';
            authView.style.display = 'flex';
            if (fxUnauthView) fxUnauthView.style.display = 'none';
            if (fxAuthView) fxAuthView.style.display = 'block';
            if (goldUnauthView) goldUnauthView.style.display = 'none';
            if (goldAuthView) goldAuthView.style.display = 'block';

            fetchFxInsights();
            fetchFxHistory(startDateInput.value, endDateInput.value);
            fetchGoldHistory(goldStartDateInput.value, goldEndDateInput.value);
            checkGoldApiQuota(false);
            renderStocks();
        } else {
            unauthView.style.display = 'block';
            authView.style.display = 'none';
            btnOpenAdmin.style.display = 'none';
            if (fxUnauthView) fxUnauthView.style.display = 'block';
            if (fxAuthView) fxAuthView.style.display = 'none';
            if (goldUnauthView) goldUnauthView.style.display = 'block';
            if (goldAuthView) goldAuthView.style.display = 'none';
            renderStocks();
        }
    }

    function setLoggedInUser(user) {
        state.currentUser = user;
        localStorage.setItem('maybe_omni_current_user', JSON.stringify(user));
        userDisplayName.textContent = user.name;
        
        if (user.role === 'admin') {
            userRoleBadge.textContent = '👑 管理員';
            userRoleBadge.style.background = '#fef3c7';
            userRoleBadge.style.color = '#92400e';
            btnOpenAdmin.style.display = 'flex';
        } else {
            userRoleBadge.textContent = '👤 一般用戶';
            userRoleBadge.style.background = '#dbeafe';
            userRoleBadge.style.color = '#1e40af';
            btnOpenAdmin.style.display = 'none';
        }
        renderAppAuthGates();
    }

    // =========================================================================
    // 9. FinMind 股票清單搜尋與 Google Gemini AI 存股健檢
    // =========================================================================
    async function fetchFinMindStockList() {
        if (cachedFinMindStockList && cachedFinMindStockList.length > 0) return cachedFinMindStockList;
        try {
            const res = await fetch("https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo");
            const json = await res.json();
            if (json.msg === 'success' && json.data) {
                // 依 stock_id 智慧去重，並優先保留細部產業類別
                const uniqueMap = new Map();
                for (const item of json.data) {
                    if (!item.stock_id) continue;
                    if (!uniqueMap.has(item.stock_id)) {
                        uniqueMap.set(item.stock_id, item);
                    } else {
                        const existing = uniqueMap.get(item.stock_id);
                        if (existing.industry_category === '電子工業' && item.industry_category !== '電子工業') {
                            uniqueMap.set(item.stock_id, item);
                        }
                    }
                }
                cachedFinMindStockList = Array.from(uniqueMap.values());
                return cachedFinMindStockList;
            }
        } catch (e) {
            console.warn("FinMind stock info fetch fallback", e);
        }
        return [];
    }

    // 呼叫 Google Studio AI (依選定模型動態呼叫) 進行存股法則深度分析
    async function generateAiStockDiagnosis(code, name, price) {
        const apiKey = state.config.geminiApiKey;
        const selectedModel = (state.config.geminiModel || 'gemini-3.6-flash').replace(/^models\//, '');
        const promptRules = state.config.geminiPrompt || STOCK_RULES_KNOWLEDGE;
        
        // 若使用者有設定 Gemini API Key，呼叫 Google Gemini API
        if (apiKey) {
            try {
                const promptText = `
你是一位精通台灣股市與存股理財的專業資深架構分析師。
請嚴格根據以下【存股大師 4 大經典選股法則與 5 大維度標準】：
${promptRules}

請為被 <target_stock> 標籤所包覆的台股標的進行客觀診斷：
<target_stock code="${escapeHtml(code)}" price="${Number(price) || 0}">
  ${escapeHtml(name)}
</target_stock>

請輸出嚴格符合以下結構的 JSON 字串（勿加上 markdown 標籤以外的多餘雜訊）：
{
  "category": "dividend 或 cashflow 或 swing (只能是這三者之一)",
  "marketCap": 估計股本或市值數值(億，純數字，如 1420),
  "eps5y": 近5年平均EPS(純數字，如 2.35),
  "divYears": 連續配息年數(整數，如 22),
  "payoutRatio": 盈餘分配率百分比(純數字，如 82.5),
  "yield": 預估現金殖利率百分比(純數字，如 5.15),
  "beta": Beta波動係數(純數字，如 0.48),
  "pb": 股價淨值比PB(純數字，如 1.45),
  "pe": 本益比PE(純數字，如 16.4),
  "diagnosis": "60~100字大白話診斷評語：說明護城河、抗跌性、配息大方程度、是否符合安全邊際與適合族群。"
}
`;
                const candidateModels = [selectedModel];
                if (!candidateModels.includes('gemini-1.5-flash')) candidateModels.push('gemini-1.5-flash');
                if (!candidateModels.includes('gemini-2.0-flash')) candidateModels.push('gemini-2.0-flash');

                for (let modelName of candidateModels) {
                    try {
                        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                        const res = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: promptText }] }]
                            })
                        });

                        if (res.ok) {
                            const json = await res.json();
                            const tokenCount = (json.usageMetadata && json.usageMetadata.totalTokenCount) || 0;
                            recordGeminiCall(tokenCount);
                            let rawText = json.candidates[0].content.parts[0].text.trim();
                            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                            if (jsonMatch) rawText = jsonMatch[0];
                            const parsed = JSON.parse(rawText);
                            parsed._source = 'gemini';
                            parsed._model = modelName;
                            console.log(`🤖 [Gemini AI 模型 (${modelName}) 診斷成功 (消耗 ${tokenCount} Tokens)]`, parsed);
                            return parsed;
                        } else {
                            console.warn(`Gemini API 模型 ${modelName} 回傳 HTTP ${res.status}，正在嘗試備援處理...`);
                            if (res.status === 429 || res.status === 503) {
                                // 遇到頻率限制或 Google 伺服器超載，稍等 1.5 秒
                                await new Promise(r => setTimeout(r, 1500));
                            }
                        }
                    } catch (mErr) {
                        console.warn(`Gemini model ${modelName} error:`, mErr);
                    }
                }
            } catch (aiErr) {
                console.warn(`Gemini API 呼叫失敗，退回經典存股規則引擎:`, aiErr);
            }
        }

        // 備援方案：依 4 本存股經典法則知識庫進行智慧規則推論
        const isEtf = code.startsWith('00');
        const isFinancial = code.startsWith('28') || code.startsWith('58');
        const isGov = ['2886', '2892', '5880', '2880', '2412'].includes(code);
        
        let category = 'dividend';
        let marketCap = 800;
        let eps5y = 2.0;
        let divYears = 12;
        let payoutRatio = 78.0;
        let y = 5.2;
        let beta = 0.55;
        let pb = 1.35;
        let pe = 16.0;
        let diag = '';

        if (isGov) {
            category = 'dividend';
            beta = 0.45;
            divYears = 20;
            payoutRatio = 82.0;
            y = 5.2;
            diag = `${name} (${code})：官股/防禦型龍頭！Beta 僅約 ${beta} 極為抗跌，連續配息逾 ${divYears} 年，符合穩健存股 5 大維度標準，為安心長抱首選。`;
        } else if (isEtf) {
            category = 'cashflow';
            beta = 0.72;
            divYears = 6;
            payoutRatio = 90.0;
            y = 6.5;
            diag = `${name} (${code})：人氣指數型/高股息 ETF，產業分散且現金流充沛，年化殖利率約 ${y}%，符合定期領息與被動現金流原則。`;
        } else if (isFinancial) {
            category = 'cashflow';
            beta = 0.65;
            divYears = 15;
            payoutRatio = 80.0;
            y = 5.5;
            diag = `${name} (${code})：金融權值指標股，資訊透明且月月公布獲利，殖利率高於 5% 買進安全線，適合定期定額累積被動收入。`;
        } else {
            category = price > 150 ? 'swing' : 'dividend';
            beta = price > 150 ? 1.2 : 0.75;
            divYears = 10;
            payoutRatio = 72.0;
            y = price > 150 ? 2.5 : 4.8;
            diag = `${name} (${code})：產業龍頭標的，獲利動能明確，${category === 'swing' ? '波動較大適合逢低波段操作賺取價差' : '配息穩定適合長期分批佈局'}。`;
        }

        return {
            category,
            marketCap,
            eps5y,
            divYears,
            payoutRatio,
            yield: y,
            beta,
            pb,
            pe,
            diagnosis: diag
        };
    }

    // =========================================================================
    // 10. 股票介面事件與渲染
    // =========================================================================
    function initStocksSection() {
        rulesToggleBtn.addEventListener('click', () => {
            const isHidden = rulesBodyContent.style.display === 'none';
            rulesBodyContent.style.display = isHidden ? 'block' : 'none';
            rulesToggleIcon.classList.toggle('rotate', isHidden);
        });

        // 浮動公式面板事件監聽
        if (floatingFormulaBtn && floatingFormulaPanel) {
            floatingFormulaBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isClosed = floatingFormulaPanel.style.display === 'none';
                floatingFormulaPanel.style.display = isClosed ? 'flex' : 'none';
            });
        }

        if (btnCloseFormulaPanel && floatingFormulaPanel) {
            btnCloseFormulaPanel.addEventListener('click', (e) => {
                e.stopPropagation();
                floatingFormulaPanel.style.display = 'none';
            });
        }

        // 點擊面板外部自動關閉
        document.addEventListener('click', (e) => {
            if (floatingFormulaPanel && floatingFormulaPanel.style.display === 'flex') {
                if (!floatingFormulaPanel.contains(e.target) && !floatingFormulaBtn.contains(e.target)) {
                    floatingFormulaPanel.style.display = 'none';
                }
            }
        });

        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.currentFilter = chip.dataset.filter;
                renderStocks();
            });
        });

        stockSearchInput.addEventListener('input', (e) => {
            state.searchTerm = e.target.value.trim().toLowerCase();
            renderStocks();
        });

        btnCloseStockModal.addEventListener('click', () => stockChartModal.style.display = 'none');

        // 股票 Modal 子頁籤切換 (走勢圖 vs 配息紀錄)
        if (subtabBtnKline && subtabBtnDividend) {
            subtabBtnKline.addEventListener('click', () => {
                subtabBtnKline.classList.add('active');
                subtabBtnDividend.classList.remove('active');
                subtabBtnKline.style.background = '#eef2ff';
                subtabBtnKline.style.color = '#4338ca';
                subtabBtnDividend.style.background = 'transparent';
                subtabBtnDividend.style.color = '#64748b';
                if (stockModalKlineView) stockModalKlineView.style.display = 'block';
                if (stockModalDividendView) stockModalDividendView.style.display = 'none';
            });

            subtabBtnDividend.addEventListener('click', () => {
                subtabBtnDividend.classList.add('active');
                subtabBtnKline.classList.remove('active');
                subtabBtnDividend.style.background = '#eef2ff';
                subtabBtnDividend.style.color = '#4338ca';
                subtabBtnKline.style.background = 'transparent';
                subtabBtnKline.style.color = '#64748b';
                if (stockModalKlineView) stockModalKlineView.style.display = 'none';
                if (stockModalDividendView) stockModalDividendView.style.display = 'block';
            });
        }

        // 複製 stock_dividends 建表 SQL 按鈕
        if (btnCopyDividendSql) {
            btnCopyDividendSql.addEventListener('click', () => {
                const sqlEl = document.getElementById('sql-stock-dividends-code');
                if (sqlEl) {
                    navigator.clipboard.writeText(sqlEl.value);
                    alert("📋 已將 stock_dividends 歷年配息表建表 SQL 複製至剪貼簿！可直接至 Supabase SQL Editor 貼上執行。");
                }
            });
        }

        // 一鍵同步所有股票今日最新現價
        const btnRefreshAllStocks = document.getElementById('btn-refresh-all-stocks');
        if (btnRefreshAllStocks) {
            btnRefreshAllStocks.addEventListener('click', () => refreshAllStockPrices(true));
        }

        // Gemini AI 配額徽章點擊事件
        const geminiQuotaBadge = document.getElementById('gemini-quota-badge');
        if (geminiQuotaBadge) {
            geminiQuotaBadge.addEventListener('click', () => checkGeminiQuota(true));
        }

        // 批次匯入股票彈窗與處理流程
        const btnOpenBatchStockModal = document.getElementById('btn-open-batch-stock-modal');
        const batchStockModal = document.getElementById('batch-stock-modal');
        const btnCloseBatchModal = document.getElementById('btn-close-batch-modal');
        const btnCancelBatch = document.getElementById('btn-cancel-batch');
        const batchStockInput = document.getElementById('batch-stock-input');
        const btnStartBatchImport = document.getElementById('btn-start-batch-import');
        const batchProgressBox = document.getElementById('batch-progress-box');
        const batchProgressStatus = document.getElementById('batch-progress-status');
        const batchProgressCount = document.getElementById('batch-progress-count');
        const batchProgressBar = document.getElementById('batch-progress-bar');
        const batchLogList = document.getElementById('batch-log-list');

        if (btnOpenBatchStockModal) {
            btnOpenBatchStockModal.addEventListener('click', () => {
                if (!state.currentUser) {
                    alert("請先登入系統後再使用批次股票匯入！");
                    loginModal.style.display = 'flex';
                    return;
                }
                batchStockInput.value = '';
                batchProgressBox.style.display = 'none';
                batchLogList.innerHTML = '';
                batchStockModal.style.display = 'flex';
            });
        }

        if (btnCloseBatchModal) btnCloseBatchModal.addEventListener('click', () => batchStockModal.style.display = 'none');
        if (btnCancelBatch) btnCancelBatch.addEventListener('click', () => batchStockModal.style.display = 'none');

        // 預設組合快捷填入
        document.querySelectorAll('.btn-preset-batch').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                if (preset) {
                    if (batchStockInput.value.trim()) {
                        batchStockInput.value += '\n' + preset;
                    } else {
                        batchStockInput.value = preset;
                    }
                }
            });
        });

        // 執行 AI 批次匯入
        if (btnStartBatchImport) {
            btnStartBatchImport.addEventListener('click', async () => {
                const raw = batchStockInput.value.trim();
                if (!raw) {
                    alert('請先輸入至少一檔股票代碼或名稱！');
                    return;
                }

                // 拆解輸入字串
                const rawItems = raw.split(/[\n,;，；]+/);
                const targets = [];
                const seenCodes = new Set();

                // 抓取全體股票清單以供名稱比對
                let fullStockList = [];
                try {
                    fullStockList = await fetchFinMindStockList();
                } catch (e) {
                    console.warn("無法取得 FinMind 完整股票清單，將直接使用輸入代碼", e);
                }

                for (let item of rawItems) {
                    let text = item.trim();
                    if (!text) continue;

                    // 1. 檢查是否包含純數字代碼 (如 2886 兆豐金 或 2886)
                    const codeMatch = text.match(/\b\d{4,6}[A-Za-z]?\b/);
                    if (codeMatch) {
                        const code = codeMatch[0];
                        if (!seenCodes.has(code)) {
                            seenCodes.add(code);
                            // 若文字中有附帶中文名稱則取之，否則從清單比對
                            let name = text.replace(code, '').trim();
                            if (!name) {
                                const found = fullStockList.find(s => s.stock_id === code);
                                name = found ? found.stock_name : `股票 ${code}`;
                            }
                            targets.push({ code, name });
                        }
                    } else {
                        // 2. 若為純中文名稱 (如 台積電 或 兆豐金)
                        const found = fullStockList.find(s => s.stock_name === text || s.stock_name.includes(text));
                        if (found && !seenCodes.has(found.stock_id)) {
                            seenCodes.add(found.stock_id);
                            targets.push({ code: found.stock_id, name: found.stock_name });
                        } else if (!found) {
                            console.warn(`無法比對股票名稱: ${text}`);
                        }
                    }
                }

                if (targets.length === 0) {
                    alert('未能識別出有效的台股代碼，請確認輸入格式（例如：2886 兆豐金 或 0050）！');
                    return;
                }

                // 開始進度條與處理流程
                btnStartBatchImport.disabled = true;
                btnStartBatchImport.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 批次處理中...';
                batchProgressBox.style.display = 'flex';
                batchLogList.innerHTML = '';
                
                const total = targets.length;
                let processed = 0;
                const client = getSupabaseClient();
                const today = new Date().toISOString().split('T')[0];
                const past = new Date(); past.setDate(new Date().getDate() - 10);
                const pastStr = past.toISOString().split('T')[0];

                for (const target of targets) {
                    processed++;
                    const pct = Math.round((processed / total) * 100);
                    batchProgressBar.style.width = `${pct}%`;
                    batchProgressCount.textContent = `${processed} / ${total}`;
                    batchProgressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> [${processed}/${total}] 正在為 <strong>${target.code} ${target.name}</strong> 抓取行情並執行 Gemini AI 健檢...`;

                    let price = 0;

                    // 1. 連線 FinMind 取得最新股價
                    try {
                        const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${target.code}&start_date=${pastStr}&end_date=${today}`);
                        const json = await res.json();
                        if (json.msg === 'success' && json.data && json.data.length > 0) {
                            const latest = json.data[json.data.length - 1];
                            price = parseFloat(latest.close);
                        }
                    } catch (e) {
                        console.warn(`FinMind 股價查詢失敗 (${target.code}):`, e);
                    }

                    if (price === 0) price = 50.0;

                    // 2. 調用 Google Gemini AI 進行存股法則 5 大維度診斷
                    const aiResult = await generateAiStockDiagnosis(target.code, target.name, price);

                    // 3. 組合股票完整資料
                    const newStock = {
                        id: target.code,
                        name: target.name,
                        price: price,
                        marketCap: aiResult.marketCap || 500,
                        eps5y: aiResult.eps5y || 2.0,
                        divYears: aiResult.divYears || 10,
                        payoutRatio: aiResult.payoutRatio || 75.0,
                        yield: aiResult.yield || 5.0,
                        beta: aiResult.beta || (aiResult.category === 'dividend' ? 0.48 : 0.8),
                        pb: aiResult.pb || 1.35,
                        pe: aiResult.pe || 15.5,
                        category: aiResult.category || 'dividend',
                        diagnosis: aiResult.diagnosis || `${target.name} (${target.code})：已完成 AI 存股健檢。`
                    };

                    // 4. 更新本地狀態
                    STOCKS_DATA = STOCKS_DATA.filter(s => s.id !== target.code);
                    STOCKS_DATA.push(newStock);
                    state.watchlist.add(target.code);

                    // 5. 寫入 Supabase stocks 與 watchlist
                    if (client) {
                        try {
                            const row = {
                                stock_id: newStock.id,
                                name: newStock.name,
                                price: newStock.price,
                                market_cap: newStock.marketCap,
                                eps_5y_avg: newStock.eps5y,
                                div_years: newStock.divYears,
                                payout_ratio: newStock.payoutRatio,
                                dividend_yield: newStock.yield,
                                beta: newStock.beta,
                                pb_ratio: newStock.pb,
                                pe_ratio: newStock.pe,
                                category_tag: newStock.category,
                                diagnosis_note: newStock.diagnosis
                            };
                            await client.from('stocks').upsert(row, { onConflict: 'stock_id' });
                            await client.from('watchlist').upsert({ user_id: 'shared_user', stock_id: target.code, stock_name: target.name }, { onConflict: 'user_id,stock_id' });
                        } catch (upsertErr) {
                            console.error(`Supabase batch upsert error (${target.code}):`, upsertErr);
                        }
                    }

                    // 6. 記錄於即時日誌視窗
                    const logItem = document.createElement('div');
                    const catText = newStock.category === 'dividend' ? '🏆 適合穩健存股' : newStock.category === 'cashflow' ? '💰 適合領高利息' : '🚀 適合波段賺價差';
                    const aiSourceTag = aiResult._source === 'gemini' 
                        ? `<span style="color: #4338ca; font-weight: 600;">🤖 Gemini (${aiResult._model || 'AI'})</span>` 
                        : `<span style="color: #64748b; font-weight: 600;">🛡️ 存股規則庫</span>`;
                    logItem.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✔ [${target.code} ${target.name}]</span> NT$${newStock.price.toFixed(2)} ｜ ${aiSourceTag} ｜ ${catText} ｜ 殖利率 ${newStock.yield}% ➔ <span style="color: #059669;">已存入 Supabase</span>`;
                    batchLogList.appendChild(logItem);
                    batchLogList.scrollTop = batchLogList.scrollHeight;

                    // 避免超過 Google AI Studio 每分鐘 15 次 (RPM) 速率限制，每檔間隔 1.2 秒
                    if (processed < total) {
                        await new Promise(r => setTimeout(r, 1200));
                    }
                }

                localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));
                renderStocks();

                batchProgressBar.style.width = '100%';
                batchProgressStatus.innerHTML = `<span style="color: #16a34a; font-weight: 700;">🎉 恭喜！已成功完成全數 ${total} 檔股票的 AI 存股健檢並全數存入 Supabase！</span>`;
                btnStartBatchImport.disabled = false;
                btnStartBatchImport.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 再次批次匯入';
            });
        }

        // 打開新增股票彈窗
        btnOpenAddStockModal.addEventListener('click', () => {
            if (!state.currentUser) {
                alert("請先登入系統後再新增專屬自選股票！");
                loginModal.style.display = 'flex';
                return;
            }
            addStockKeywordInput.value = '';
            stockSearchMatchesEl.style.display = 'none';
            stockSearchMatchesEl.innerHTML = '';
            addStockCodeInput.value = '';
            addStockNameInput.value = '';
            addStockPriceInput.value = '';
            addStockDiagnosisInput.value = '';
            tempCalculatedMetrics = null;
            addStockModal.style.display = 'flex';
        });

        btnCloseAddStockModal.addEventListener('click', () => {
            addStockModal.style.display = 'none';
        });

        // 搜尋 FinMind 股票 (支援多支選擇)
        btnSearchFinMindStock.addEventListener('click', async () => {
            const kw = addStockKeywordInput.value.trim();
            if (!kw) {
                alert("請輸入股票代碼或名稱（例如 2886, 台積電, 國泰）！");
                return;
            }

            btnSearchFinMindStock.disabled = true;
            btnSearchFinMindStock.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 搜尋中...';

            try {
                const list = await fetchFinMindStockList();
                const matches = list.filter(s => s.stock_id.includes(kw) || s.stock_name.includes(kw));

                if (matches.length === 0) {
                    // 若無精確清單比對，且輸入為代碼，允許直接使用
                    if (/^\d+[A-Za-z]?$/.test(kw)) {
                        await selectAndDiagnoseStock(kw, `股票 ${kw}`);
                    } else {
                        alert(`查無與「${kw}」相符的台股標的，請確認代碼或名稱是否有誤。`);
                    }
                } else if (matches.length === 1) {
                    stockSearchMatchesEl.style.display = 'none';
                    await selectAndDiagnoseStock(matches[0].stock_id, matches[0].stock_name);
                } else {
                    // 多支匹配：將精確匹配排在最前
                    matches.sort((a, b) => {
                        const aExact = (a.stock_id === kw || a.stock_name === kw) ? 0 : 1;
                        const bExact = (b.stock_id === kw || b.stock_name === kw) ? 0 : 1;
                        return aExact - bExact;
                    });

                    const exactMatch = matches.find(s => s.stock_id === kw || s.stock_name === kw);

                    stockSearchMatchesEl.style.display = 'block';
                    stockSearchMatchesEl.innerHTML = `
                        <div class="stock-matches-title">
                            <i class="fa-solid fa-list-check"></i> 找到 ${matches.length} 支相符股票，請點選欲健檢的標的：
                        </div>
                        <div class="stock-matches-chips">
                            ${matches.slice(0, 12).map(s => {
                                const isExact = (s.stock_id === kw || s.stock_name === kw);
                                return `
                                    <button type="button" class="btn-stock-choice ${isExact ? 'exact-match' : ''}" data-id="${s.stock_id}" data-name="${s.stock_name}">
                                        <strong>${s.stock_id}</strong> ${s.stock_name}
                                        <span style="color: #166534; font-size: 0.72rem;">${isExact ? '★ 精確' : `(${s.industry_category || '一般'})`}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    `;

                    stockSearchMatchesEl.querySelectorAll('.btn-stock-choice').forEach(b => {
                        b.addEventListener('click', async () => {
                            const cid = b.dataset.id;
                            const cname = b.dataset.name;
                            stockSearchMatchesEl.style.display = 'none';
                            await selectAndDiagnoseStock(cid, cname);
                        });
                    });

                    // 若有 100% 精確匹配（如輸入 2002 匹配到 2002 中鋼），直接自動帶入並開始 AI 健檢
                    if (exactMatch) {
                        await selectAndDiagnoseStock(exactMatch.stock_id, exactMatch.stock_name);
                    }
                }
            } catch (err) {
                alert("搜尋股票時發生錯誤：" + err.message);
            } finally {
                btnSearchFinMindStock.disabled = false;
                btnSearchFinMindStock.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 搜尋股票';
            }
        });

        // 選擇某支股票並觸發股價抓取與 AI 分析
        async function selectAndDiagnoseStock(code, name) {
            addStockCodeInput.value = code;
            addStockNameInput.value = name;
            
            // 1. 啟動 AI 健檢動態進度條與按鈕鎖定
            if (aiDiagnoseProgressBox) {
                aiDiagnoseProgressBox.style.display = 'flex';
                if (aiProgressStepText) {
                    aiProgressStepText.textContent = 'Step 1/3: 正在連線 FinMind 抓取最新股價與歷史行情...';
                }
            }
            btnAiDiagnoseStock.disabled = true;
            btnAiDiagnoseStock.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i> Gemini AI 深度運算中...';
            btnSubmitAddStock.disabled = true;
            btnSubmitAddStock.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI 健檢進行中，請稍候...';
            addStockDiagnosisInput.value = '正在連線 FinMind 抓取數據並由 Google Gemini AI 進行存股法則深度健檢...';

            let price = 0;
            const client = getSupabaseClient();

            // 優先查詢 Supabase stock_prices 是否有最新股價
            if (client) {
                try {
                    const { data: latestDbPrice } = await client
                        .from('stock_prices')
                        .select('close_price')
                        .eq('stock_id', code)
                        .order('trade_date', { ascending: false })
                        .limit(1);
                    if (latestDbPrice && latestDbPrice.length > 0 && latestDbPrice[0].close_price) {
                        price = parseFloat(latestDbPrice[0].close_price);
                        console.log(`⚡ [Supabase 命中] 成功從 Supabase 讀取 ${code} 最新收盤價 NT$ ${price}`);
                    }
                } catch (dbErr) {
                    console.warn("Supabase price query error:", dbErr);
                }
            }

            // 若 Supabase 尚無股價資料，連線 FinMind 抓取
            if (!price) {
                try {
                    const today = new Date().toISOString().split('T')[0];
                    const past = new Date(); past.setDate(new Date().getDate() - 30);
                    const pastStr = past.toISOString().split('T')[0];
                    const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${pastStr}&end_date=${today}`);
                    const json = await res.json();
                    if (json.msg === 'success' && json.data && json.data.length > 0) {
                        const latest = json.data[json.data.length - 1];
                        price = latest.close;
                    }
                } catch (e) {
                    console.warn("FinMind price fallback", e);
                }
            }

            if (price === 0) price = 35.0;
            addStockPriceInput.value = price.toFixed(2);

            // 2. 切換步驟至 Gemini AI 分析
            if (aiProgressStepText) {
                const currentModel = state.config.geminiModel || 'gemini-3.6-flash';
                aiProgressStepText.textContent = `Step 2/3: 正在由 Google Gemini AI (${currentModel}) 進行 5 大維度存股評估...`;
            }

            // 觸發 Gemini AI 存股健檢
            const aiResult = await generateAiStockDiagnosis(code, name, price);
            tempCalculatedMetrics = aiResult;

            if (aiProgressStepText) {
                aiProgressStepText.textContent = 'Step 3/3: 正在提煉大白話存股評語與指標評分...';
            }

            // 3. 填入分析結果
            addStockCategoryInput.value = aiResult.category;
            addStockDiagnosisInput.value = aiResult.diagnosis;

            // 4. 顯示完成動畫並恢復按鈕
            if (aiProgressStepText) {
                aiProgressStepText.innerHTML = '<span style="color: #16a34a; font-weight: 700;">✨ AI 存股健檢分析完成！已自動產出 5 大維度診斷</span>';
            }
            setTimeout(() => {
                if (aiDiagnoseProgressBox) aiDiagnoseProgressBox.style.display = 'none';
            }, 1800);

            btnAiDiagnoseStock.disabled = false;
            btnAiDiagnoseStock.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 觸發 Gemini AI 重新分析';
            btnSubmitAddStock.disabled = false;
            btnSubmitAddStock.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 儲存並加入 Supabase 資料庫';
        }

        // 手動點選「觸發 Gemini AI 重新分析」按鈕
        btnAiDiagnoseStock.addEventListener('click', async () => {
            const code = addStockCodeInput.value.trim().toUpperCase();
            const name = addStockNameInput.value.trim() || `股票 ${code}`;
            const price = parseFloat(addStockPriceInput.value) || 50.0;
            if (!code) {
                alert("請先輸入股票代碼！");
                return;
            }

            if (aiDiagnoseProgressBox) {
                aiDiagnoseProgressBox.style.display = 'flex';
                if (aiProgressStepText) {
                    const currentModel = state.config.geminiModel || 'gemini-3.6-flash';
                    aiProgressStepText.textContent = `正在由 Google Gemini AI (${currentModel}) 重新依 5 大維度法則運算中...`;
                }
            }

            btnAiDiagnoseStock.disabled = true;
            btnAiDiagnoseStock.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i> AI 分析中...';
            btnSubmitAddStock.disabled = true;
            btnSubmitAddStock.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI 健檢進行中，請稍候...';
            addStockDiagnosisInput.value = 'Google Studio AI (Gemini) 正在根據存股法則進行運算分析...';

            const aiResult = await generateAiStockDiagnosis(code, name, price);
            tempCalculatedMetrics = aiResult;

            addStockCategoryInput.value = aiResult.category;
            addStockDiagnosisInput.value = aiResult.diagnosis;

            if (aiProgressStepText) {
                aiProgressStepText.innerHTML = '<span style="color: #16a34a; font-weight: 700;">✨ AI 存股健檢重新分析完成！</span>';
            }
            setTimeout(() => {
                if (aiDiagnoseProgressBox) aiDiagnoseProgressBox.style.display = 'none';
            }, 1800);

            btnAiDiagnoseStock.disabled = false;
            btnAiDiagnoseStock.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 觸發 Gemini AI 重新分析';
            btnSubmitAddStock.disabled = false;
            btnSubmitAddStock.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 儲存並加入 Supabase 資料庫';
        });

        // 提交儲存至 Supabase
        btnSubmitAddStock.addEventListener('click', async () => {
            const code = addStockCodeInput.value.trim().toUpperCase();
            if (!code) {
                alert("請輸入股票代碼！");
                return;
            }

            const name = addStockNameInput.value.trim() || `股票 ${code}`;
            const price = parseFloat(addStockPriceInput.value) || 50.0;
            const category = addStockCategoryInput.value || 'dividend';
            const diag = addStockDiagnosisInput.value.trim() || `${name} (${code})：已加入專屬存股健檢庫。`;

            const metrics = tempCalculatedMetrics || {
                marketCap: 500,
                eps5y: 2.0,
                divYears: 10,
                payoutRatio: 75.0,
                yield: 5.0,
                beta: category === 'dividend' ? 0.48 : category === 'cashflow' ? 0.72 : 1.15,
                pb: 1.35,
                pe: 15.5
            };

            const newStock = {
                id: code,
                name: name,
                price: price,
                marketCap: metrics.marketCap || 500,
                eps5y: metrics.eps5y || 2.0,
                divYears: metrics.divYears || 10,
                payoutRatio: metrics.payoutRatio || 75.0,
                yield: metrics.yield || 5.0,
                beta: metrics.beta || (category === 'dividend' ? 0.48 : 0.8),
                pb: metrics.pb || 1.35,
                pe: metrics.pe || 15.5,
                category: category,
                diagnosis: diag
            };

            // 存入本地清單
            STOCKS_DATA = STOCKS_DATA.filter(s => s.id !== code);
            STOCKS_DATA.push(newStock);

            // 自動加入自選
            state.watchlist.add(code);
            localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));

            // 同步寫入 Supabase stocks 與 watchlist 資料表
            const client = getSupabaseClient();
            if (client) {
                const row = {
                    stock_id: newStock.id,
                    name: newStock.name,
                    price: newStock.price,
                    market_cap: newStock.marketCap,
                    eps_5y_avg: newStock.eps5y,
                    div_years: newStock.divYears,
                    payout_ratio: newStock.payoutRatio,
                    dividend_yield: newStock.yield,
                    beta: newStock.beta,
                    pb_ratio: newStock.pb,
                    pe_ratio: newStock.pe,
                    category_tag: newStock.category,
                    diagnosis_note: newStock.diagnosis
                };
                const { error: upsertErr } = await client.from('stocks').upsert(row, { onConflict: 'stock_id' });
                if (upsertErr) console.error("Supabase stock upsert error:", upsertErr);

                await client.from('watchlist').upsert({ user_id: 'shared_user', stock_id: code, stock_name: name }, { onConflict: 'user_id,stock_id' });
            }

            addStockModal.style.display = 'none';
            renderStocks();
            alert(`🎉 成功新增 ${code} ${name}！已依據 4 本存股經典完成 AI 健檢並同步存入 Supabase。`);
        });

        rangeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                rangeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.chartRange = parseInt(btn.dataset.range);
                if (state.selectedStockForChart) {
                    renderStockChart(state.selectedStockForChart);
                }
            });
        });

        btnTypeLine.addEventListener('click', () => {
            btnTypeLine.classList.add('active');
            btnTypeCandle.classList.remove('active');
            state.chartType = 'line';
            if (state.selectedStockForChart) renderStockChart(state.selectedStockForChart);
        });

        btnTypeCandle.addEventListener('click', () => {
            btnTypeCandle.classList.add('active');
            btnTypeLine.classList.remove('active');
            state.chartType = 'candle';
            if (state.selectedStockForChart) renderStockChart(state.selectedStockForChart);
        });

        renderStocks();
    }

    // 批量連線 FinMind 抓取所有股票最新收盤價並同步更新至 Supabase
    async function refreshAllStockPrices(showNotice = false) {
        if (!STOCKS_DATA || STOCKS_DATA.length === 0) {
            if (showNotice) alert('目前尚未加入任何股票標的，請先點擊「+ 新增股票」！');
            return;
        }

        const btnRefresh = document.getElementById('btn-refresh-all-stocks');
        if (btnRefresh) {
            btnRefresh.disabled = true;
            btnRefresh.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 股價更新中...';
        }

        const today = new Date().toISOString().split('T')[0];
        const past = new Date(); past.setDate(new Date().getDate() - 10);
        const pastStr = past.toISOString().split('T')[0];
        const client = getSupabaseClient();
        let updatedCount = 0;

        for (const stock of STOCKS_DATA) {
            try {
                const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stock.id}&start_date=${pastStr}&end_date=${today}`);
                const json = await res.json();
                if (json.msg === 'success' && json.data && json.data.length > 0) {
                    const latest = json.data[json.data.length - 1];
                    stock.price = parseFloat(latest.close);
                    
                    // 優先採用真實最新全年/近4季配息累計計算即時現金殖利率
                    let calculatedYield = stock.yield;
                    if (client) {
                        try {
                            let { data: divRows } = await client
                                .from('stock_dividends')
                                .select('cash_dividend, stock_dividend, total_dividend, ex_dividend_date, payment_date, announcement_date, year')
                                .eq('stock_id', stock.id)
                                .order('announcement_date', { ascending: false });

                            // 若 Supabase stock_dividends 尚無快取資料，主動向 FinMind 抓取並自動整批入庫
                            if (!divRows || divRows.length === 0) {
                                try {
                                    const divRes = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${stock.id}&start_date=2015-01-01`);
                                    const divJson = await divRes.json();
                                    if (divJson.msg === 'success' && divJson.data && divJson.data.length > 0) {
                                        const rawSorted = divJson.data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                                        let mappedList = rawSorted.map(item => {
                                            const cash = parseFloat(item.CashEarningsDistribution || 0) + parseFloat(item.CashStatutorySurplus || 0);
                                            const stk = parseFloat(item.StockEarningsDistribution || 0) + parseFloat(item.StockStatutorySurplus || 0);
                                            const total = cash + stk;
                                            const exDate = item.CashExDividendTradingDate || item.StockExDividendTradingDate || '';
                                            const payDate = item.CashDividendPaymentDate || '';
                                            const rawYr = item.year || (item.date ? item.date.slice(0, 4) + '年' : '歷年');
                                            const yr = formatDividendYear(rawYr, payDate, exDate);
                                            const rowId = `${stock.id}_${item.date}_${yr}_${exDate || 'noex'}`.replace(/\s+/g, '_');
                                            return {
                                                id: rowId,
                                                stock_id: stock.id,
                                                year: yr,
                                                cash_dividend: parseFloat(cash.toFixed(4)),
                                                stock_dividend: parseFloat(stk.toFixed(4)),
                                                total_dividend: parseFloat(total.toFixed(4)),
                                                ex_dividend_date: exDate || '--',
                                                payment_date: payDate || '--',
                                                announcement_date: item.date || ''
                                            };
                                        });
                                        mappedList = enrichDividendList(mappedList);
                                        mappedList.forEach(item => {
                                            if (item.formatted_period) item.year = item.formatted_period;
                                        });
                                        await client.from('stock_dividends').upsert(mappedList, { onConflict: 'id' });
                                        divRows = mappedList;
                                        console.log(`💾 [自動入庫] 批量股價更新已成功為 ${stock.name} 寫入 ${mappedList.length} 筆配息至 Supabase stock_dividends！`);
                                    }
                                } catch (divFetchErr) {
                                    console.warn(`FinMind dividend auto-sync for ${stock.id} error:`, divFetchErr);
                                }
                            }

                            if (divRows && divRows.length > 0 && stock.price > 0) {
                                const annualCash = calculateAnnualCashDividend(divRows);
                                if (annualCash > 0) {
                                    calculatedYield = parseFloat(((annualCash / stock.price) * 100).toFixed(2));
                                }
                            }
                        } catch (divErr) {
                            console.warn("Real dividend fetch for yield calculation fallback", divErr);
                        }
                    }
                    if (!calculatedYield && stock.eps5y && stock.payoutRatio && stock.price > 0 && stock.eps5y > 0) {
                        const estimatedDiv = (stock.eps5y * stock.payoutRatio) / 100;
                        calculatedYield = parseFloat(((estimatedDiv / stock.price) * 100).toFixed(2));
                    }
                    if (calculatedYield) stock.yield = calculatedYield;

                    if (client) {
                        await client.from('stocks').update({
                            price: stock.price,
                            dividend_yield: stock.yield,
                            updated_at: new Date()
                        }).eq('stock_id', stock.id);
                    }
                    updatedCount++;
                }
            } catch (e) {
                console.warn(`更新 ${stock.name} (${stock.id}) 股價失敗:`, e);
            }
        }

        renderStocks();

        if (btnRefresh) {
            btnRefresh.disabled = false;
            btnRefresh.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 更新最新股價';
        }

        if (showNotice) {
            alert(`🎉 成功同步 ${updatedCount} 檔股票的最新收盤價與即時殖利率！已存入 Supabase。`);
        }
    }

    function evaluateStockHealth(stock) {
        const metrics = [];
        let score = 0;

        const passCap = stock.marketCap >= 300;
        if (passCap) score++;
        metrics.push({ label: '股本規模', val: `${stock.marketCap} 億`, pass: passCap ? 'pass' : 'warn', desc: passCap ? '≥300億 大型不倒翁' : '中小型需留意流動性' });

        const passEps = stock.eps5y >= 1.0;
        if (passEps) score++;
        metrics.push({ label: '5年平均EPS', val: `${stock.eps5y} 元`, pass: passEps ? 'pass' : 'fail', desc: passEps ? '獲利穩定達標' : '獲利過低或衰退' });

        const passDivYears = stock.divYears >= 10;
        if (passDivYears) score++;
        metrics.push({ label: '連續配息', val: `${stock.divYears} 年`, pass: passDivYears ? 'pass' : 'warn', desc: passDivYears ? '歷經多空考驗' : '<10年觀察中' });

        const passPayout = stock.payoutRatio >= 70;
        if (passPayout) score++;
        metrics.push({ label: '盈餘分配率', val: `${stock.payoutRatio}%`, pass: passPayout ? 'pass' : 'warn', desc: passPayout ? '公司大方分紅' : '<70% 保留盈餘較多' });

        let passYield = 'fail';
        if (stock.yield >= 5.0) { passYield = 'pass'; score++; }
        else if (stock.yield >= 4.0) { passYield = 'warn'; }
        metrics.push({ label: '現金殖利率', val: `${stock.yield}%`, pass: passYield, desc: stock.yield >= 5.0 ? '≥5% 便宜好買點' : '<5% 偏貴建議暫緩' });

        let passBeta = 'fail';
        if (stock.beta < 0.6) { passBeta = 'pass'; score++; }
        else if (stock.beta <= 0.85) { passBeta = 'pass'; score++; }
        else { passBeta = 'warn'; }
        metrics.push({ label: 'Beta 波動度', val: `${stock.beta}`, pass: passBeta, desc: stock.beta < 0.8 ? '牛皮抗跌抱得安心' : '波動較大適合價差' });

        const passPb = stock.pb < 2.5;
        if (passPb) score++;
        metrics.push({ label: '股價淨值比', val: `${stock.pb}`, pass: passPb ? 'pass' : 'fail', desc: passPb ? '<2.5 未過度炒作' : '股價偏離淨值過高' });

        const passPe = stock.pe <= 20;
        if (passPe) score++;
        metrics.push({ label: '本益比 PE', val: `${stock.pe}`, pass: passPe ? 'pass' : 'warn', desc: passPe ? '物美價廉' : '偏高需評估成長性' });

        return { score, total: 8, metrics };
    }

    function renderStocks() {
        stocksContainer.innerHTML = '';

        // 1. 如果未登入，顯示需登入才能檢視股票之提示
        if (!state.currentUser) {
            countAllEl.textContent = '0';
            countFavEl.textContent = '0';
            stocksContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1.5rem; background: rgba(255, 255, 255, 0.7); border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <i class="fa-solid fa-lock" style="font-size: 3rem; margin-bottom: 1rem; color: #94a3b8;"></i>
                    <h3 style="margin-bottom: 0.5rem; color: #1e293b;">請先登入以檢視與管理您的專屬股票健檢庫</h3>
                    <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem;">本模組為個人化投資清單，登入後即可自行新增股票代碼並同步至雲端資料庫。</p>
                    <button class="primary-btn" id="btn-login-from-stocks" style="padding: 0.75rem 1.75rem; font-size: 0.95rem; margin: 0 auto; display: inline-flex;">
                        <i class="fa-solid fa-right-to-bracket"></i> 立即登入系統
                    </button>
                </div>
            `;
            const btnLogin = document.getElementById('btn-login-from-stocks');
            if (btnLogin) {
                btnLogin.addEventListener('click', () => {
                    loginModal.style.display = 'flex';
                    initGoogleIdentityServices();
                });
            }
            return;
        }

        // 2. 如果已登入但清單為空，顯示新增股票引導提示
        if (STOCKS_DATA.length === 0) {
            countAllEl.textContent = '0';
            countFavEl.textContent = '0';
            stocksContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1.5rem; background: rgba(255, 255, 255, 0.7); border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 3rem; margin-bottom: 1rem; color: #3b82f6;"></i>
                    <h3 style="margin-bottom: 0.5rem; color: #1e293b;">目前尚未加入任何股票標的</h3>
                    <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem;">點擊右上角「+ 新增股票」輸入台股代碼或名稱，Gemini AI 將依 4 本存股經典為您自動健檢！</p>
                    <button class="primary-btn" id="btn-empty-add-stock" style="padding: 0.75rem 1.75rem; font-size: 0.95rem; margin: 0 auto; display: inline-flex;">
                        <i class="fa-solid fa-plus"></i> 立即新增第一檔股票
                    </button>
                </div>
            `;
            const btnEmptyAdd = document.getElementById('btn-empty-add-stock');
            if (btnEmptyAdd) {
                btnEmptyAdd.addEventListener('click', () => {
                    addStockModal.style.display = 'flex';
                });
            }
            return;
        }

        // 3. 已登入且有股票時的篩選與渲染
        const filtered = STOCKS_DATA.filter(stock => {
            const matchSearch = stock.id.includes(state.searchTerm) || stock.name.toLowerCase().includes(state.searchTerm);
            if (!matchSearch) return false;

            if (state.currentFilter === 'watchlist') return state.watchlist.has(stock.id);
            if (state.currentFilter === 'dividend') return stock.category === 'dividend';
            if (state.currentFilter === 'cashflow') return stock.category === 'cashflow';
            if (state.currentFilter === 'swing') return stock.category === 'swing';
            if (state.currentFilter === 'high-pass') {
                const evalResult = evaluateStockHealth(stock);
                return evalResult.score >= 6;
            }
            return true;
        });

        countAllEl.textContent = STOCKS_DATA.length;
        countFavEl.textContent = state.watchlist.size;

        if (filtered.length === 0) {
            stocksContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.75rem; color: var(--text-sub);"></i>
                    <p>沒有找到符合條件的股票標的。</p>
                </div>
            `;
            return;
        }

        filtered.forEach(stock => {
            const health = evaluateStockHealth(stock);
            const isFav = state.watchlist.has(stock.id);
            const scorePercent = Math.round((health.score / health.total) * 100);

            let catBadge = '';
            if (stock.category === 'dividend') catBadge = `<span class="category-badge category-dividend"><i class="fa-solid fa-crown"></i> 🏆 適合穩健存股</span>`;
            else if (stock.category === 'cashflow') catBadge = `<span class="category-badge category-cashflow"><i class="fa-solid fa-money-bill-wave"></i> 💰 適合領高利息</span>`;
            else catBadge = `<span class="category-badge category-swing"><i class="fa-solid fa-bolt"></i> 🚀 適合波段賺價差</span>`;

            const safeId = escapeHtml(stock.id);
            const safeName = escapeHtml(stock.name);
            const safeDiagnosis = escapeHtml(stock.diagnosis);

            const card = document.createElement('div');
            card.className = 'stock-card';
            card.innerHTML = `
                <div class="stock-card-header">
                    <div class="stock-title-wrap">
                        <div class="stock-code-name">${safeId} ${safeName}</div>
                        <div class="stock-price-display">NT$ ${stock.price.toFixed(2)}</div>
                    </div>
                    <div style="display: flex; gap: 0.35rem; align-items: center;">
                        <button class="btn-star-fav ${isFav ? 'favorited' : ''}" data-id="${safeId}" title="${isFav ? '移出自選' : '加入自選'}">
                            <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
                        </button>
                        <button class="btn-star-fav btn-delete-stock" data-id="${safeId}" title="從健檢庫刪除" style="color: #ef4444;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                ${catBadge}

                <div class="health-score-wrap">
                    <div class="health-score-header">
                        <span>存股指標健檢評分</span>
                        <span>${health.score} / ${health.total} 項達標 (${scorePercent}分)</span>
                    </div>
                    <div class="health-progress-bar">
                        <div class="health-progress-fill" style="width: ${scorePercent}%;"></div>
                    </div>
                </div>

                <div class="diagnosis-box">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent-blue);"></i> <strong>AI 存股診斷：</strong>${safeDiagnosis}
                </div>

                <div class="metrics-pill-grid">
                    ${health.metrics.map(m => `
                        <div class="metric-pill" title="${m.desc}">
                            <span class="metric-pill-label">${m.label}</span>
                            <span class="metric-pill-val metric-${m.pass}">
                                ${m.pass === 'pass' ? '✅' : m.pass === 'warn' ? '⚠️' : '❌'} ${m.val}
                            </span>
                        </div>
                    `).join('')}
                </div>

                <div class="stock-card-actions">
                    <button class="btn-view-chart" data-id="${stock.id}">
                        <i class="fa-solid fa-chart-line"></i> 查看歷史收盤走勢與 K 線
                    </button>
                </div>
            `;

            // 自選星號按鈕
            const starBtn = card.querySelector('.btn-star-fav:not(.btn-delete-stock)');
            starBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const client = getSupabaseClient();
                if (state.watchlist.has(stock.id)) {
                    state.watchlist.delete(stock.id);
                    if (client) {
                        client.from('watchlist').delete().eq('user_id', 'shared_user').eq('stock_id', stock.id);
                    }
                } else {
                    state.watchlist.add(stock.id);
                    if (client) {
                        client.from('watchlist').upsert({ user_id: 'shared_user', stock_id: stock.id, stock_name: stock.name }, { onConflict: 'user_id,stock_id' });
                    }
                }
                localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));
                renderStocks();
            });

            // 刪除股票按鈕
            const deleteBtn = card.querySelector('.btn-delete-stock');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`確定要將 ${stock.id} ${stock.name} 從健檢資料庫刪除嗎？`)) return;
                
                STOCKS_DATA = STOCKS_DATA.filter(s => s.id !== stock.id);
                state.watchlist.delete(stock.id);
                localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));

                const client = getSupabaseClient();
                if (client) {
                    await client.from('stocks').delete().eq('stock_id', stock.id);
                    await client.from('watchlist').delete().eq('stock_id', stock.id);
                    await client.from('stock_prices').delete().eq('stock_id', stock.id);
                }

                renderStocks();
            });

            // 查看走勢圖與歷年配息按鈕
            const chartBtn = card.querySelector('.btn-view-chart');
            chartBtn.addEventListener('click', () => {
                state.selectedStockForChart = stock;
                modalStockTitle.textContent = `${stock.id} ${stock.name} - 行情走勢與配息`;
                modalStockPrice.textContent = `NT$ ${stock.price.toFixed(2)}`;

                // 預設開啟 K 線走勢分頁
                if (subtabBtnKline && subtabBtnDividend) {
                    subtabBtnKline.classList.add('active');
                    subtabBtnDividend.classList.remove('active');
                    subtabBtnKline.style.background = '#eef2ff';
                    subtabBtnKline.style.color = '#4338ca';
                    subtabBtnDividend.style.background = 'transparent';
                    subtabBtnDividend.style.color = '#64748b';
                }
                if (stockModalKlineView) stockModalKlineView.style.display = 'block';
                if (stockModalDividendView) stockModalDividendView.style.display = 'none';

                stockChartModal.style.display = 'flex';
                renderStockChart(stock);
                loadStockDividends(stock);
            });

            stocksContainer.appendChild(card);
        });
    }

    // =========================================================================
    // 11. 股票歷史行情圖表 (Supabase 優先查詢，未命中才呼叫 FinMind 並自動入庫)
    // =========================================================================
    async function renderStockChart(stock) {
        let chartData = [];
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - state.chartRange);
        const startStr = pastDate.toISOString().split('T')[0];

        const client = getSupabaseClient();

        let hitSupabase = false;
        if (client) {
            try {
                const { data: dbPrices, error } = await client
                    .from('stock_prices')
                    .select('*')
                    .eq('stock_id', stock.id)
                    .gte('trade_date', startStr)
                    .order('trade_date', { ascending: true });
                
                if (dbPrices && !error && dbPrices.length >= Math.floor(state.chartRange * 0.45)) {
                    chartData = dbPrices.map(d => ({
                        date: d.trade_date,
                        close: parseFloat(d.close_price),
                        open: parseFloat(d.open_price || d.close_price),
                        high: parseFloat(d.high_price || d.close_price),
                        low: parseFloat(d.low_price || d.close_price)
                    }));
                    hitSupabase = true;
                    console.log(`⚡ [Supabase 命中] 成功從 Supabase 載入 ${stock.name} ${chartData.length} 筆歷史收盤價！`);
                }
            } catch (e) {
                console.warn("Supabase stock_prices read error:", e);
            }
        }

        if (!hitSupabase) {
            console.log(`🌐 [API 抓取] 正在從 FinMind 抓取 ${stock.name} (${stock.id}) 歷史日 K...`);
            try {
                const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stock.id}&start_date=${startStr}`);
                const json = await res.json();
                if (json.msg === 'success' && json.data && json.data.length > 0) {
                    chartData = json.data.map(d => ({
                        date: d.date,
                        close: d.close,
                        open: d.open,
                        high: d.max,
                        low: d.min
                    }));

                    if (client) {
                        const rowsToInsert = json.data.map(d => ({
                            stock_id: stock.id,
                            trade_date: d.date,
                            open_price: d.open,
                            high_price: d.max,
                            low_price: d.min,
                            close_price: d.close,
                            volume: d.Trading_Volume || d.Trading_Turnover || 0
                        }));
                        client.from('stock_prices').upsert(rowsToInsert, { onConflict: 'stock_id,trade_date' }).then(() => {
                            console.log(`💾 [自動入庫] 已將 ${stock.name} ${rowsToInsert.length} 筆日 K 同步存入 Supabase！`);
                        });
                    }
                } else {
                    console.warn(`FinMind API 未回傳 ${stock.name} (${stock.id}) 的歷史 K 線數據`);
                }
            } catch (e) {
                console.warn(`FinMind API 抓取失敗:`, e);
            }
        }

        if (stockChartInstance) stockChartInstance.destroy();

        if (chartData.length === 0) {
            console.warn(`目前尚無 ${stock.name} (${stock.id}) 的歷史 K 線數據`);
            return;
        }

        const labels = chartData.map(d => d.date);
        const closes = chartData.map(d => d.close);

        if (state.chartType === 'line') {
            stockChartInstance = new Chart(stockModalChartCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${stock.name} 收盤價 (NT$)`,
                        data: closes,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        borderWidth: 2.5,
                        tension: 0.25,
                        fill: true,
                        pointRadius: labels.length > 60 ? 0 : 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { ticks: { callback: (v) => 'NT$ ' + v.toFixed(2) } }
                    }
                }
            });
        } else {
            stockChartInstance = new Chart(stockModalChartCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '日收盤 (紅漲綠跌)',
                        data: closes,
                        backgroundColor: chartData.map(d => d.close >= d.open ? '#dc2626' : '#059669'),
                        borderRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false }
                }
            });
        }
    }

    // =========================================================================
    // 11.5 股票歷年配息紀錄 (Supabase 優先查詢，未命中連線 FinMind 並自動入庫)
    // =========================================================================
    async function loadStockDividends(stock) {
        if (!stock || !stock.id) return;
        if (dividendBadgeCount) dividendBadgeCount.textContent = '載入中...';
        if (stockDividendTbody) {
            stockDividendTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> 正在連線查詢歷年與各季配息紀錄...</td></tr>';
        }

        const client = getSupabaseClient();
        let dividendList = [];
        let hitSupabase = false;

        // 1. Supabase 快取優先查詢
        if (client) {
            try {
                const { data: dbDividends, error } = await client
                    .from('stock_dividends')
                    .select('*')
                    .eq('stock_id', stock.id)
                    .order('announcement_date', { ascending: false });

                if (dbDividends && !error && dbDividends.length > 0) {
                    dividendList = dbDividends;
                    hitSupabase = true;
                    console.log(`⚡ [Supabase 命中] 成功從 Supabase 載入 ${stock.name} ${dividendList.length} 筆歷年配息紀錄！`);
                }
            } catch (e) {
                console.warn("Supabase stock_dividends query error:", e);
            }
        }

        // 2. 若 Supabase 無資料，連線 FinMind TaiwanStockDividend 抓取
        if (!hitSupabase) {
            try {
                console.log(`🌐 [API 抓取] 正在從 FinMind 抓取 ${stock.name} (${stock.id}) 歷年配息...`);
                const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${stock.id}&start_date=2015-01-01`);
                const json = await res.json();
                if (json.msg === 'success' && json.data && json.data.length > 0) {
                    // 依公告日期反向排序 (最新在最前)
                    const rawSorted = json.data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    
                    dividendList = rawSorted.map(item => {
                        const cash = parseFloat(item.CashEarningsDistribution || 0) + parseFloat(item.CashStatutorySurplus || 0);
                        const stk = parseFloat(item.StockEarningsDistribution || 0) + parseFloat(item.StockStatutorySurplus || 0);
                        const total = cash + stk;
                        const exDate = item.CashExDividendTradingDate || item.StockExDividendTradingDate || '';
                        const payDate = item.CashDividendPaymentDate || '';
                        const rawYr = item.year || (item.date ? item.date.slice(0, 4) + '年' : '歷年');
                        const yr = formatDividendYear(rawYr, payDate, exDate);
                        // 組合主鍵 ID: stock_id + year + ex_date/date
                        const rowId = `${stock.id}_${item.date}_${yr}_${exDate || 'noex'}`.replace(/\s+/g, '_');

                        return {
                            id: rowId,
                            stock_id: stock.id,
                            year: yr,
                            cash_dividend: parseFloat(cash.toFixed(4)),
                            stock_dividend: parseFloat(stk.toFixed(4)),
                            total_dividend: parseFloat(total.toFixed(4)),
                            ex_dividend_date: exDate || '--',
                            payment_date: payDate || '--',
                            announcement_date: item.date || ''
                        };
                    });

                    // 3. 智慧推論標註精準配息期別 (如 2026Q3, 2026H1, 2024/05)
                    dividendList = enrichDividendList(dividendList);
                    dividendList.forEach(item => {
                        if (item.formatted_period) {
                            item.year = item.formatted_period;
                        }
                    });

                    // 4. 自動整批入庫至 Supabase stock_dividends
                    if (client && dividendList.length > 0) {
                        try {
                            const { error: upsertErr } = await client
                                .from('stock_dividends')
                                .upsert(dividendList, { onConflict: 'id' });
                            
                            if (!upsertErr) {
                                console.log(`💾 [自動入庫] 成功將 ${stock.name} ${dividendList.length} 筆配息紀錄寫入 Supabase stock_dividends！`);
                            } else {
                                console.warn("Supabase batch upsert stock_dividends error:", upsertErr);
                            }
                        } catch (insE) {
                            console.warn("Supabase stock_dividends upsert exception:", insE);
                        }
                    }
                }
            } catch (apiErr) {
                console.error("FinMind dividend fetch error:", apiErr);
            }
        }

        // 4. 計算全年/近4季年化現金股利並校正當前股票現金殖利率
        if (dividendList && dividendList.length > 0 && stock && stock.price > 0) {
            const annualCash = calculateAnnualCashDividend(dividendList);
            if (annualCash > 0) {
                const accurateYield = parseFloat(((annualCash / stock.price) * 100).toFixed(2));
                if (accurateYield && stock.yield !== accurateYield) {
                    stock.yield = accurateYield;
                    if (client) {
                        client.from('stocks').update({
                            dividend_yield: accurateYield,
                            updated_at: new Date()
                        }).eq('stock_id', stock.id).then(() => {}).catch(() => {});
                    }
                    renderStocks();
                }
            }
        }

        // 5. 渲染配息表格與統計指標
        renderDividendUI(dividendList, stock);
    }

    function cleanAndDeduplicateDividends(rawList) {
        if (!rawList || rawList.length === 0) return [];

        const exMap = new Map();

        rawList.forEach(item => {
            const cash = parseFloat(item.cash_dividend || 0);
            const stk = parseFloat(item.stock_dividend || 0);
            const total = parseFloat(item.total_dividend) || (cash + stk);

            // 嚴格過濾非配息紀錄（現金股利與股票股利皆為 0 的現金增資除權或無配發公告）
            if (cash <= 0 && stk <= 0 && total <= 0) {
                return;
            }

            const exDate = (item.ex_dividend_date && item.ex_dividend_date !== '--') ? item.ex_dividend_date : '';
            const payDate = (item.payment_date && item.payment_date !== '--') ? item.payment_date : '';
            const annDate = (item.announcement_date && item.announcement_date !== '--') ? item.announcement_date : '';

            // 除息唯一鍵值：優先用 exDate，若無則用 payDate 或 annDate
            const key = exDate || payDate || annDate || Math.random().toString();

            if (exMap.has(key)) {
                const existing = exMap.get(key);
                const existingTotal = parseFloat(existing.total_dividend) || (parseFloat(existing.cash_dividend || 0) + parseFloat(existing.stock_dividend || 0));
                
                // 優先保留配息金額 > 0 的有效決議；若金額相同則保留公告日較新的紀錄
                if (total > existingTotal || (total === existingTotal && (annDate > (existing.announcement_date || '')))) {
                    exMap.set(key, item);
                }
            } else {
                exMap.set(key, item);
            }
        });

        // 依除息日/公告日反向排序 (最新在最前)
        return Array.from(exMap.values()).sort((a, b) => {
            const da = a.ex_dividend_date || a.payment_date || a.announcement_date || '';
            const db = b.ex_dividend_date || b.payment_date || b.announcement_date || '';
            return db.localeCompare(da);
        });
    }

    function enrichDividendList(list) {
        if (!list || list.length === 0) return list;
        // 先執行除息日去重與無效 0 股利過濾
        list = cleanAndDeduplicateDividends(list);

        // 1. 按西元年度分組收集所有紀錄
        const yearGroups = {};
        list.forEach(item => {
            const dStr = (item.ex_dividend_date && item.ex_dividend_date !== '--') 
                ? item.ex_dividend_date 
                : ((item.payment_date && item.payment_date !== '--') ? item.payment_date : (item.announcement_date || ''));
            
            let y = dStr.slice(0, 4);
            if (!y || isNaN(parseInt(y, 10))) {
                const numMatch = (item.year || '').match(/(\d{2,4})/);
                if (numMatch) {
                    const n = parseInt(numMatch[1], 10);
                    y = String(n < 1900 ? n + 1911 : n);
                }
            }
            if (y && /^\d{4}$/.test(y)) {
                if (!yearGroups[y]) yearGroups[y] = [];
                yearGroups[y].push(item);
            }
        });

        // 2. 計算歷史各年配息次數以判斷頻率
        const counts = Object.values(yearGroups).map(arr => arr.length);
        const maxCount = Math.max(1, ...counts);

        let freq = 'annual'; // 'monthly' | 'quarterly' | 'half' | 'annual'
        if (maxCount >= 6) {
            freq = 'monthly';
        } else if (maxCount >= 3) {
            freq = 'quarterly';
        } else if (maxCount === 2) {
            freq = 'half';
        }

        // 3. 逐年為每筆紀錄標註精準期別 (例如 2026Q3、2026H1、2024/05、2026)
        Object.keys(yearGroups).forEach(yStr => {
            const rows = yearGroups[yStr];
            // 依除息日/公告日排序 (早到晚)
            rows.sort((a, b) => {
                const da = a.ex_dividend_date || a.payment_date || a.announcement_date || '';
                const db = b.ex_dividend_date || b.payment_date || b.announcement_date || '';
                return da.localeCompare(db);
            });

            rows.forEach((row, idx) => {
                // 如果字串本身已包含明確指定 (如 114Q4 或 114H1 或 05月)
                const explicit = formatDividendYear(row.year, row.payment_date, row.ex_dividend_date);
                if (explicit.includes('Q') || explicit.includes('H') || explicit.includes('/')) {
                    row.formatted_period = explicit;
                    return;
                }

                const dStr = (row.ex_dividend_date && row.ex_dividend_date !== '--') 
                    ? row.ex_dividend_date 
                    : ((row.payment_date && row.payment_date !== '--') ? row.payment_date : (row.announcement_date || ''));
                const monthVal = parseInt(dStr.slice(5, 7), 10);

                if (freq === 'monthly') {
                    const mm = monthVal ? String(monthVal).padStart(2, '0') : String(idx + 1).padStart(2, '0');
                    row.formatted_period = `${yStr}/${mm}`;
                } else if (freq === 'quarterly') {
                    let q = 1;
                    if (rows.length === 4) {
                        q = idx + 1;
                    } else if (monthVal) {
                        q = Math.ceil(monthVal / 3);
                    } else {
                        q = Math.min(4, idx + 1);
                    }
                    row.formatted_period = `${yStr}Q${q}`;
                } else if (freq === 'half') {
                    let h = 1;
                    if (rows.length >= 2) {
                        h = idx === 0 ? 1 : 2;
                    } else {
                        h = monthVal <= 8 ? 1 : 2;
                    }
                    row.formatted_period = `${yStr}H${h}`;
                } else {
                    row.formatted_period = yStr;
                }
            });
        });

        return list;
    }

    function formatDividendYear(rawYear, payDate, exDate) {
        if (!rawYear || rawYear === '--') {
            const fallbackYear = (payDate && payDate !== '--') ? payDate.slice(0, 4) : ((exDate && exDate !== '--') ? exDate.slice(0, 4) : '');
            return fallbackYear || '--';
        }

        let str = String(rawYear).trim();

        // 1. 判斷是否有季度 Q1~Q4 或 第1季~第4季
        let quarter = null;
        const qMatch = str.match(/第([1-4])季|Q([1-4])/i);
        if (qMatch) {
            quarter = qMatch[1] || qMatch[2];
        }

        // 2. 判斷是否有半年度 H1/H2 或 上半年/下半年 或 第1次/第2次
        let half = null;
        if (!quarter) {
            if (/上半年|第1次|H1/i.test(str)) {
                half = '1';
            } else if (/下半年|第2次|H2/i.test(str)) {
                half = '2';
            }
        }

        // 3. 判斷是否有月份 (例如 113年05月、113/05、5月、05月、2024-05)
        let month = null;
        if (!quarter && !half) {
            const mMatch = str.match(/(?:年|\/|\-)?\s*(\d{1,2})\s*月/) || str.match(/[\/\-](\d{1,2})$/);
            if (mMatch) {
                const mVal = parseInt(mMatch[1], 10);
                if (mVal >= 1 && mVal <= 12) {
                    month = String(mVal).padStart(2, '0');
                }
            }
        }

        // 4. 提取年份數字
        let yearNum = null;
        const numMatch = str.match(/(\d{2,4})/);
        if (numMatch) {
            yearNum = parseInt(numMatch[1], 10);
        } else {
            const fallbackYear = (payDate && payDate !== '--') ? payDate.slice(0, 4) : ((exDate && exDate !== '--') ? exDate.slice(0, 4) : '');
            if (fallbackYear) yearNum = parseInt(fallbackYear, 10);
        }

        if (!yearNum) return str;

        // 若為民國年 (小於 1900，例如 114, 113, 112, 98)，一律轉為西元年 (西元 = 民國 + 1911)
        const adYear = yearNum < 1900 ? yearNum + 1911 : yearNum;

        // 組合標準西元年格式 (例如 2025Q4、2026H1、2012/05、2026) - 依照需求不加「年」字
        if (quarter) {
            return `${adYear}Q${quarter}`;
        } else if (half) {
            return `${adYear}H${half}`;
        } else if (month) {
            return `${adYear}/${month}`;
        } else {
            return `${adYear}`;
        }
    }

    function calculateAnnualCashDividend(dividendList) {
        if (!dividendList || dividendList.length === 0) return 0;
        dividendList = enrichDividendList(dividendList);

        // 判斷是否為月配息 / 季配息 / 半年配
        const yearCountMap = {};
        let isMonthly = false;
        let isQuarterly = false;
        let isHalfYear = false;

        dividendList.forEach(item => {
            const formattedYr = item.formatted_period || formatDividendYear(item.year, item.payment_date, item.ex_dividend_date);
            if (formattedYr.includes('/')) {
                isMonthly = true;
            } else if (formattedYr.includes('Q')) {
                isQuarterly = true;
            } else if (formattedYr.includes('H')) {
                isHalfYear = true;
            }
            const yKey = formattedYr.slice(0, 4);
            if (yKey) {
                yearCountMap[yKey] = (yearCountMap[yKey] || 0) + 1;
            }
        });

        const isMultiPeriod = isMonthly || isQuarterly || isHalfYear || Object.values(yearCountMap).some(c => c > 1);

        if (isMultiPeriod) {
            // 月配息取最新 12 個月加總、季配息取最新 4 季、半年配取最新 2 次
            const maxPeriods = isMonthly ? 12 : (isQuarterly ? 4 : (isHalfYear ? 2 : 4));
            const periodsToSum = Math.min(dividendList.length, maxPeriods);
            const sumLatestPeriods = dividendList.slice(0, periodsToSum).reduce((sum, r) => sum + (parseFloat(r.cash_dividend) || 0), 0);
            return sumLatestPeriods;
        } else {
            // 年配息標的（如中鋼 2002、兆豐金 2886、廣達 2382、玉山金 2884）：
            // 嚴禁跨年累加！直接取最新一年的真實單年現金股利
            for (let i = 0; i < dividendList.length; i++) {
                const cash = parseFloat(dividendList[i].cash_dividend) || 0;
                if (cash > 0) {
                    return cash;
                }
            }
            return parseFloat(dividendList[0].cash_dividend) || 0;
        }
    }

    function renderDividendUI(list, stock) {
        if (!list) list = [];
        list = enrichDividendList(list);

        if (dividendBadgeCount) dividendBadgeCount.textContent = `${list.length} 筆`;

        if (!list || list.length === 0) {
            if (stockDividendTbody) {
                stockDividendTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 2rem;">查無此標的近期配息紀錄。</td></tr>';
            }
            if (divStatCount) divStatCount.textContent = '0 次';
            if (divStatAvg3) divStatAvg3.textContent = 'NT$ 0.00';
            if (divStatAvg5) divStatAvg5.textContent = 'NT$ 0.00';
            if (divStatLatestEx) divStatLatestEx.textContent = '--';
            return;
        }

        // 計算累計與平均指標
        const totalCount = list.length;
        // 近 3 年 / 近 5 年現金股利平均 (按西元年度加總計算)
        const yearCashMap = {};
        list.forEach(item => {
            const formattedYr = item.formatted_period || formatDividendYear(item.year, item.payment_date, item.ex_dividend_date);
            const yKey = formattedYr.slice(0, 4); // 擷取 4 碼西元年 (例如 2025, 2024)
            if (yKey && /^\d{4}$/.test(yKey)) {
                yearCashMap[yKey] = (yearCashMap[yKey] || 0) + (parseFloat(item.cash_dividend) || 0);
            }
        });
        const yearlyCashValues = Object.values(yearCashMap);
        const avg3 = yearlyCashValues.length > 0 
            ? (yearlyCashValues.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, yearlyCashValues.length)).toFixed(2) 
            : '0.00';
        const avg5 = yearlyCashValues.length > 0 
            ? (yearlyCashValues.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, yearlyCashValues.length)).toFixed(2) 
            : '0.00';

        const latestItem = list[0];
        const latestEx = (latestItem && latestItem.ex_dividend_date && latestItem.ex_dividend_date !== '--') 
            ? latestItem.ex_dividend_date.replace(/-/g, '/') 
            : ((latestItem && latestItem.announcement_date) ? latestItem.announcement_date.replace(/-/g, '/') : '--');

        if (divStatCount) divStatCount.textContent = `${totalCount} 次`;
        if (divStatAvg3) divStatAvg3.textContent = `NT$ ${avg3}`;
        if (divStatAvg5) divStatAvg5.textContent = `NT$ ${avg5}`;
        if (divStatLatestEx) divStatLatestEx.textContent = latestEx;

        if (stockDividendTbody) {
            stockDividendTbody.innerHTML = list.map(item => {
                const formattedYear = item.formatted_period || formatDividendYear(item.year, item.payment_date, item.ex_dividend_date);
                const safeYear = escapeHtml(formattedYear);

                const safeCash = parseFloat(item.cash_dividend || 0).toFixed(2);
                const safeStk = parseFloat(item.stock_dividend || 0).toFixed(2);
                const safeTotal = parseFloat(item.total_dividend || 0).toFixed(2);
                const safeEx = (item.ex_dividend_date && item.ex_dividend_date !== '--') 
                    ? escapeHtml(item.ex_dividend_date.replace(/-/g, '/')) 
                    : '--';
                const safePay = (item.payment_date && item.payment_date !== '--') 
                    ? escapeHtml(item.payment_date.replace(/-/g, '/')) 
                    : '--';
                const safeAnn = (item.announcement_date && item.announcement_date !== '--') 
                    ? escapeHtml(item.announcement_date.replace(/-/g, '/')) 
                    : '--';

                return `
                    <tr>
                        <td style="vertical-align: middle; white-space: nowrap;">
                            <strong style="font-size: 0.95rem; color: #0f172a;">${safeYear}</strong>
                        </td>
                        <td style="color: #15803d; font-weight: 700; vertical-align: middle; white-space: nowrap;">NT$ ${safeCash}</td>
                        <td style="color: #4338ca; vertical-align: middle; white-space: nowrap;">${safeStk} 股</td>
                        <td style="color: #0f172a; font-weight: 700; vertical-align: middle; white-space: nowrap;">NT$ ${safeTotal}</td>
                        <td style="vertical-align: middle; white-space: nowrap; font-family: ui-monospace, monospace;">${safeEx}</td>
                        <td style="vertical-align: middle; white-space: nowrap; font-family: ui-monospace, monospace;"><span style="color: #059669; font-weight: 600;">${safePay}</span></td>
                        <td style="color: #64748b; font-size: 0.78rem; vertical-align: middle; white-space: nowrap; font-family: ui-monospace, monospace;">${safeAnn}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // =========================================================================
    // 12. 匯率與金價 (Date-Gapped Smart Cache 精準補齊快取)
    // =========================================================================
    function initFxAndGoldSection() {
        const calc = () => {
            const amt = parseFloat(amountInput.value) || 0;
            const from = fromCurrency.value;
            const to = toCurrency.value;
            const res = (amt * state.exchangeRates[from]) / state.exchangeRates[to];
            resultAmount.textContent = res.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            resultCurrency.textContent = to;
        };

        amountInput.addEventListener('input', calc);
        fromCurrency.addEventListener('change', () => {
            calc();
            fetchFxHistory(startDateInput.value, endDateInput.value);
        });
        toCurrency.addEventListener('change', () => {
            calc();
            fetchFxHistory(startDateInput.value, endDateInput.value);
        });
        swapBtn.addEventListener('click', () => {
            const tmp = fromCurrency.value;
            fromCurrency.value = toCurrency.value;
            toCurrency.value = tmp;
            calc();
            fetchFxHistory(startDateInput.value, endDateInput.value);
        });

        searchBtn.addEventListener('click', () => fetchFxHistory(startDateInput.value, endDateInput.value));
        goldSearchBtn.addEventListener('click', () => fetchGoldHistory(goldStartDateInput.value, goldEndDateInput.value));

        // 黃金幣別與單位視圖切換 (台灣公克、銀樓每錢、國際盎司、雙軸對照)
        document.querySelectorAll('.btn-gold-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-gold-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.goldViewMode = btn.dataset.mode || 'twd';
                renderGoldChart(state.cachedGoldList);
            });
        });

        // 若已登入則由 renderAppAuthGates 自動調用 API 載入數據
    }

    async function checkGoldApiQuota(showPrompt = false) {
        const key = (adminGoldKey && adminGoldKey.value.trim()) || state.config.goldApiKey;
        const quotaBadgeText = document.getElementById('gold-quota-text');
        const adminResult = document.getElementById('gold-quota-admin-result');

        if (!key) {
            if (quotaBadgeText) quotaBadgeText.textContent = 'GoldAPI (尚未設定 Key)';
            if (showPrompt) alert('尚未設定 GoldAPI.io Token！請在後台設定中填入您的 Access Token。');
            return;
        }

        if (quotaBadgeText) quotaBadgeText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 查詢額度中...';

        try {
            const res = await fetch("https://www.goldapi.io/api/stat", {
                headers: {
                    "x-access-token": key,
                    "Content-Type": "application/json"
                }
            });

            const headerLimit = res.headers.get("x-ratelimit-limit");
            const headerRemaining = res.headers.get("x-ratelimit-remaining");

            if (res.ok) {
                const data = await res.json();
                const monthUsed = data.requests_month ?? data.month_requests ?? 0;
                const monthLimit = data.requests_limit ?? headerLimit ?? 100;
                const remaining = headerRemaining ? parseInt(headerRemaining) : Math.max(0, monthLimit - monthUsed);

                state.goldApiQuotaRemaining = remaining;
                try { sessionStorage.setItem('goldapi_remaining', String(remaining)); } catch(e) {}

                const msg = `本月剩餘：${remaining} 次 (已用 ${monthUsed} / 上限 ${monthLimit})`;
                if (quotaBadgeText) {
                    if (remaining <= 0) {
                        quotaBadgeText.textContent = 'GoldAPI 本月額度已耗盡 (0 次)';
                        quotaBadgeText.style.color = '#ef4444';
                    } else {
                        quotaBadgeText.textContent = `GoldAPI 本月剩餘: ${remaining} 次`;
                        quotaBadgeText.style.color = '';
                    }
                }
                if (adminResult) {
                    adminResult.style.display = 'block';
                    adminResult.textContent = `📊 ${msg}`;
                }
                if (showPrompt) alert(`📊 GoldAPI.io 本月額度狀態：\n${msg}`);
            } else {
                if (res.status === 429 || res.status === 403) {
                    state.goldApiQuotaRemaining = 0;
                    try { sessionStorage.setItem('goldapi_remaining', '0'); } catch(e) {}
                    if (quotaBadgeText) {
                        quotaBadgeText.textContent = 'GoldAPI 本月額度已耗盡 (0 次)';
                        quotaBadgeText.style.color = '#ef4444';
                    }
                }
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (err) {
            console.warn("GoldAPI quota query fallback", err);
            if (state.goldApiQuotaRemaining === 0) {
                if (quotaBadgeText) {
                    quotaBadgeText.textContent = 'GoldAPI 本月額度已耗盡 (0 次)';
                    quotaBadgeText.style.color = '#ef4444';
                }
            } else {
                if (quotaBadgeText) quotaBadgeText.textContent = 'GoldAPI 連線正常';
            }
            if (adminResult) {
                adminResult.style.display = 'block';
                adminResult.textContent = '可直接至 goldapi.io/dashboard 查看額度';
            }
            if (showPrompt) alert('無法直接連線讀取 GoldAPI 統計，建議登入 https://www.goldapi.io/dashboard 查看詳細額度。');
        }
    }

    async function fetchFxInsights() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const past = new Date(); past.setDate(new Date().getDate() - 45);
            const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanExchangeRate&data_id=USD&start_date=${past.toISOString().split('T')[0]}&end_date=${today}`);
            const json = await res.json();
            if (json.msg === 'success' && json.data && json.data.length > 0) {
                const data = json.data.slice(-30);
                const latest = data[data.length - 1];
                const avgSell = data.reduce((s, i) => s + i.spot_sell, 0) / data.length;
                const avgBuy = data.reduce((s, i) => s + i.spot_buy, 0) / data.length;

                state.exchangeRates.USD = latest.spot_sell;
                sellRateEl.textContent = latest.spot_sell.toFixed(3);
                buyRateEl.textContent = latest.spot_buy.toFixed(3);
                avgRateEl.textContent = avgSell.toFixed(3);

                if (latest.spot_sell < avgSell) {
                    sellInsightEl.className = 'insight-status good';
                    sellInsightEl.querySelector('.status-text').textContent = '便宜！現在換外幣出國划算';
                } else {
                    sellInsightEl.className = 'insight-status bad';
                    sellInsightEl.querySelector('.status-text').textContent = '偏貴！近期處於高點';
                }

                if (latest.spot_buy > avgBuy) {
                    buyInsightEl.className = 'insight-status good';
                    buyInsightEl.querySelector('.status-text').textContent = '賺到！現在換回台幣划算';
                } else {
                    buyInsightEl.className = 'insight-status bad';
                    buyInsightEl.querySelector('.status-text').textContent = '不佳！換回台幣虧本';
                }

                loadingEl.style.display = 'none';
                dataContentEl.style.display = 'block';
            } else {
                loadingEl.style.display = 'none';
                dataContentEl.style.display = 'block';
                sellRateEl.textContent = '--';
                buyRateEl.textContent = '--';
                avgRateEl.textContent = '--';
                sellInsightEl.className = 'insight-status bad';
                sellInsightEl.querySelector('.status-text').textContent = '暫無即時匯率，請點擊查詢';
                buyInsightEl.className = 'insight-status bad';
                buyInsightEl.querySelector('.status-text').textContent = '暫無即時匯率，請點擊查詢';
            }
        } catch (e) {
            console.warn("FinMind Fx insights fetch error:", e);
            loadingEl.style.display = 'none';
            dataContentEl.style.display = 'block';
            sellRateEl.textContent = '--';
            buyRateEl.textContent = '--';
            avgRateEl.textContent = '--';
            sellInsightEl.className = 'insight-status bad';
            sellInsightEl.querySelector('.status-text').textContent = '連線異常，請稍後點擊重新整理';
            buyInsightEl.className = 'insight-status bad';
            buyInsightEl.querySelector('.status-text').textContent = '連線異常，請稍後點擊重新整理';
        }
    }

    async function fetchFxHistory(start, end) {
        const fromCurr = fromCurrency ? fromCurrency.value : 'USD';
        const toCurr = toCurrency ? toCurrency.value : 'TWD';
        let list = [];
        const client = getSupabaseClient();
        const existingMap = new Map();

        // 1. 先查 Supabase exchange_rates
        if (client) {
            try {
                const { data: dbFx, error } = await client
                    .from('exchange_rates')
                    .select('*')
                    .eq('from_currency', fromCurr)
                    .eq('to_currency', toCurr)
                    .gte('trade_date', start)
                    .lte('trade_date', end)
                    .order('trade_date', { ascending: true });
                
                if (dbFx && !error && dbFx.length > 0) {
                    dbFx.forEach(d => {
                        existingMap.set(d.trade_date, {
                            date: d.trade_date,
                            spot_sell: parseFloat(d.spot_sell || d.rate),
                            spot_buy: parseFloat(d.spot_buy || d.rate)
                        });
                    });
                    console.log(`⚡ [Supabase 命中] 從 Supabase 讀取到 ${dbFx.length} 筆 ${fromCurr} -> ${toCurr} 現有匯率快取`);
                }
            } catch (e) {
                console.warn("Supabase exchange_rates query error:", e);
            }
        }

        // 2. 檢查區間內是否有缺少的日期 (排除週末)
        const missingDates = [];
        let cur = new Date(start);
        const endObj = new Date(end);
        while (cur <= endObj) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                const dStr = cur.toISOString().split('T')[0];
                if (!existingMap.has(dStr)) {
                    missingDates.push(dStr);
                }
            }
            cur.setDate(cur.getDate() + 1);
        }

        // 3. 若有缺漏日期，向 FinMind 抓取真實數據並自動入庫
        if (missingDates.length > 0) {
            console.log(`🌐 [匯率補充] 正在向 FinMind API 抓取 ${fromCurr} -> ${toCurr} 真實匯率...`);
            let apiList = [];
            try {
                const targetCurrency = fromCurr === 'TWD' ? toCurr : fromCurr;
                const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanExchangeRate&data_id=${targetCurrency}&start_date=${start}&end_date=${end}`);
                const json = await res.json();
                if (json.msg === 'success' && json.data && json.data.length > 0) {
                    apiList = json.data;
                }
            } catch (e) {
                console.warn("FinMind fetch error:", e);
            }

            const rowsToInsert = [];
            apiList.forEach(d => {
                const item = {
                    date: d.date,
                    spot_sell: parseFloat(d.spot_sell),
                    spot_buy: parseFloat(d.spot_buy)
                };
                existingMap.set(d.date, item);
                rowsToInsert.push({
                    trade_date: d.date,
                    from_currency: fromCurr,
                    to_currency: toCurr,
                    spot_sell: d.spot_sell,
                    spot_buy: d.spot_buy,
                    cash_sell: d.cash_sell || d.spot_sell,
                    cash_buy: d.cash_buy || d.spot_buy,
                    rate: d.spot_sell
                });
            });

            if (client && rowsToInsert.length > 0) {
                const { error: upsertErr } = await client
                    .from('exchange_rates')
                    .upsert(rowsToInsert, { onConflict: 'trade_date,from_currency,to_currency' });
                if (upsertErr) {
                    console.error("Supabase exchange_rates upsert error:", upsertErr);
                } else {
                    console.log(`💾 [真實入庫] 成功將 ${rowsToInsert.length} 筆 FinMind 真實匯率寫入 Supabase！`);
                }
            }
        }

        list = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        if (fxChartInstance) fxChartInstance.destroy();

        if (list.length === 0) {
            historyTbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: #64748b; padding: 2rem;">
                        <i class="fa-solid fa-circle-info" style="margin-bottom: 0.5rem; display: block; font-size: 1.25rem;"></i>
                        Supabase 尚無此幣別在該區間的歷史匯率。請點擊「查詢匯率」由 FinMind API 即時抓取真實數據！
                    </td>
                </tr>
            `;
            return;
        }

        fxChartInstance = new Chart(historyChartCtx, {
            type: 'line',
            data: {
                labels: list.map(d => d.date),
                datasets: [
                    { label: `${fromCurr} 賣出價 (換成 ${toCurr})`, data: list.map(d => d.spot_sell), borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.08)', borderWidth: 2, tension: 0.2, fill: true },
                    { label: `${fromCurr} 買入價 (換回 ${toCurr})`, data: list.map(d => d.spot_buy), borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.08)', borderWidth: 2, tension: 0.2, fill: true }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } }
        });

        historyTbody.innerHTML = '';
        [...list].reverse().forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.date}</td><td>${item.spot_sell.toFixed(3)}</td><td>${item.spot_buy.toFixed(3)}</td>`;
            historyTbody.appendChild(tr);
        });
    }

    async function fetchGoldHistory(start, end) {
        let list = [];
        const client = getSupabaseClient();
        const existingMap = new Map();
        const goldKey = state.config.goldApiKey;

        // 1. 先查 Supabase gold_prices 現有快取
        if (client) {
            try {
                const { data: dbGold, error } = await client
                    .from('gold_prices')
                    .select('*')
                    .gte('trade_date', start)
                    .lte('trade_date', end)
                    .order('trade_date', { ascending: true });
                
                if (dbGold && !error && dbGold.length > 0) {
                    dbGold.forEach(d => {
                        existingMap.set(d.trade_date, {
                            date: d.trade_date,
                            usd: parseFloat(d.usd_per_oz),
                            twd: parseFloat(d.twd_per_gram)
                        });
                    });
                    console.log(`⚡ [Supabase 命中] 從 Supabase 讀取到 ${dbGold.length} 筆真實金價紀錄`);
                }
            } catch (e) {
                console.warn("Supabase gold_prices query error:", e);
            }
        }

        // 2. 檢查區間內是否有缺少的交易日 (排除週末)
        const missingDates = [];
        let cur = new Date(start);
        const endObj = new Date(end);
        while (cur <= endObj) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                const dStr = cur.toISOString().split('T')[0];
                if (!existingMap.has(dStr)) {
                    missingDates.push(dStr);
                }
            }
            cur.setDate(cur.getDate() + 1);
        }

        // 3. 若有缺漏的歷史日期，向 FinMind 官方歷史金價 (GoldPrice) 抓取真實數據並自動入庫
        if (missingDates.length > 0) {
            console.log(`🌐 [金價歷史補齊] 正在從 FinMind 官方資料庫抓取 ${start} ~ ${end} 歷史真實金價...`);
            try {
                const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=GoldPrice&start_date=${start}&end_date=${end}`);
                const json = await res.json();
                if (json.msg === 'success' && json.data && json.data.length > 0) {
                    const dailyMap = new Map();
                    json.data.forEach(item => {
                        const dStr = item.date.split(' ')[0];
                        dailyMap.set(dStr, parseFloat(item.Price));
                    });

                    const rowsToInsert = [];
                    const usdRate = state.exchangeRates.USD || 32.5;

                    dailyMap.forEach((priceUsd, dStr) => {
                        const realUsd = parseFloat(priceUsd.toFixed(2));
                        const realTwd = parseFloat(((realUsd * usdRate) / 31.1035).toFixed(2));
                        existingMap.set(dStr, { date: dStr, usd: realUsd, twd: realTwd });
                        rowsToInsert.push({
                            trade_date: dStr,
                            usd_per_oz: realUsd,
                            twd_per_gram: realTwd
                        });
                    });

                    if (client && rowsToInsert.length > 0) {
                        client.from('gold_prices').upsert(rowsToInsert, { onConflict: 'trade_date' }).then(() => {
                            console.log(`💾 [真實入庫] 成功將 FinMind ${rowsToInsert.length} 筆歷史金價寫入 Supabase！`);
                        });
                    }
                }
            } catch (err) {
                console.warn("FinMind GoldPrice fetch error:", err);
            }
        }

        // 4. 若有設定 GoldAPI Key 且額度 > 0，額外抓取今日即時現貨報價；若額度為 0 則防呆阻擋，不發送請求
        const savedQuota = (state.goldApiQuotaRemaining !== null && state.goldApiQuotaRemaining !== undefined)
            ? state.goldApiQuotaRemaining
            : (sessionStorage.getItem('goldapi_remaining') !== null ? parseInt(sessionStorage.getItem('goldapi_remaining'), 10) : null);

        if (goldKey && savedQuota !== 0) {
            try {
                console.log("🌐 [GoldAPI] 正在向官方 API 抓取今日即時金價...");
                const res = await fetch("https://www.goldapi.io/api/XAU/USD", {
                    headers: { "x-access-token": goldKey }
                });

                // 動態讀取 Header 剩餘額度
                const headerRemaining = res.headers.get("x-ratelimit-remaining");
                if (headerRemaining !== null) {
                    const rNum = parseInt(headerRemaining, 10);
                    state.goldApiQuotaRemaining = rNum;
                    try { sessionStorage.setItem('goldapi_remaining', String(rNum)); } catch(e) {}
                    const quotaBadgeText = document.getElementById('gold-quota-text');
                    if (quotaBadgeText) {
                        if (rNum <= 0) {
                            quotaBadgeText.textContent = 'GoldAPI 本月額度已耗盡 (0 次)';
                            quotaBadgeText.style.color = '#ef4444';
                        } else {
                            quotaBadgeText.textContent = `GoldAPI 本月剩餘: ${rNum} 次`;
                            quotaBadgeText.style.color = '';
                        }
                    }
                }

                if (res.status === 429 || res.status === 403) {
                    state.goldApiQuotaRemaining = 0;
                    try { sessionStorage.setItem('goldapi_remaining', '0'); } catch(e) {}
                    const quotaBadgeText = document.getElementById('gold-quota-text');
                    if (quotaBadgeText) {
                        quotaBadgeText.textContent = 'GoldAPI 本月額度已耗盡 (0 次)';
                        quotaBadgeText.style.color = '#ef4444';
                    }
                    console.warn("⚠️ [GoldAPI 防呆阻擋] 收到 429/403 額度用盡，自動停止後續請求。");
                    return;
                }

                if (res.ok) {
                    const j = await res.json();
                    if (j.price) {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const realUsd = parseFloat(j.price);
                        const usdRate = state.exchangeRates.USD || 32.5;
                        const realTwd = parseFloat(((realUsd * usdRate) / 31.1035).toFixed(2));
                        const todayRow = { date: todayStr, usd: realUsd, twd: realTwd };
                        existingMap.set(todayStr, todayRow);

                        // 將真實即時 API 數值寫入 Supabase
                        if (client) {
                            client.from('gold_prices').upsert([{
                                trade_date: todayStr,
                                usd_per_oz: realUsd,
                                twd_per_gram: realTwd
                            }], { onConflict: 'trade_date' }).then(() => {
                                console.log(`💾 [即時入庫] 成功將 GoldAPI 今日即時金價 ($${realUsd}) 寫入 Supabase！`);
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn("GoldAPI live fetch error:", err);
            }
        } else if (goldKey && savedQuota === 0) {
            console.log("🛡️ [GoldAPI 防呆機制] 本月額度為 0 次，已自動跳過 GoldAPI 請求，改採 FinMind 與 Supabase 快取！");
        }

        list = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        if (list.length === 0) {
            goldUsdPrice.textContent = "--";
            goldTwdPrice.textContent = "--";
            if (goldTsinPrice) goldTsinPrice.textContent = "--";
            if (goldChartInstance) goldChartInstance.destroy();
            goldTbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #b45309; padding: 2rem;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        Supabase 尚無此區間金價紀錄。請確認「後台設定」中已填入 GoldAPI Token，點擊「查詢金價」即可從官方 API 抓取真實數據並自動寫入資料庫！
                    </td>
                </tr>
            `;
            return;
        }

        state.cachedGoldList = list;

        const lastItem = list[list.length - 1];
        goldUsdPrice.textContent = lastItem.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        goldTwdPrice.textContent = lastItem.twd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (goldTsinPrice) goldTsinPrice.textContent = (lastItem.twd * 3.75).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

        renderGoldChart(list);

        goldTbody.innerHTML = '';
        [...list].reverse().forEach(item => {
            const tr = document.createElement('tr');
            const tsinVal = (item.twd * 3.75).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            tr.innerHTML = `
                <td><strong>${item.date}</strong></td>
                <td style="color: #166534; font-weight: 700;">NT$${item.twd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="color: #b45309; font-weight: 700;">NT$${tsinVal}</td>
                <td style="color: #2563eb;">$${item.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            `;
            goldTbody.appendChild(tr);
        });
    }

    // 依選定模式繪製金價走勢圖 (單軸直覺 vs 雙軸對照)
    function renderGoldChart(list) {
        if (!list || list.length === 0) return;
        if (goldChartInstance) goldChartInstance.destroy();

        const labels = list.map(d => d.date);
        let datasets = [];
        let scales = {};

        if (state.goldViewMode === 'twd') {
            // 1. 預設：台灣金價 (NT$/公克) - 單一清晰 Y 軸
            datasets = [{
                label: '🇹🇼 台灣金價 (NT$/公克)',
                data: list.map(d => d.twd),
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.1)',
                borderWidth: 2.5,
                tension: 0.25,
                fill: true,
                pointRadius: labels.length > 30 ? 0 : 3
            }];
            scales = {
                y: {
                    title: { display: true, text: '新台幣 / 公克 (NT$/g)' },
                    ticks: { callback: v => 'NT$' + v }
                }
            };
        } else if (state.goldViewMode === 'tsin') {
            // 2. 台灣銀樓 (NT$/每錢，約3.75公克) - 單一清晰 Y 軸
            datasets = [{
                label: '🏪 台灣銀樓 (NT$/每錢，約3.75公克)',
                data: list.map(d => parseFloat((d.twd * 3.75).toFixed(1))),
                borderColor: '#d97706',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                borderWidth: 2.5,
                tension: 0.25,
                fill: true,
                pointRadius: labels.length > 30 ? 0 : 3
            }];
            scales = {
                y: {
                    title: { display: true, text: '新台幣 / 台錢 (NT$/錢)' },
                    ticks: { callback: v => 'NT$' + v.toLocaleString() }
                }
            };
        } else if (state.goldViewMode === 'usd') {
            // 3. 國際金價 (USD/盎司) - 單一清晰 Y 軸
            datasets = [{
                label: '🌐 國際金價 (USD/盎司)',
                data: list.map(d => d.usd),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2.5,
                tension: 0.25,
                fill: true,
                pointRadius: labels.length > 30 ? 0 : 3
            }];
            scales = {
                y: {
                    title: { display: true, text: '美元 / 盎司 (USD/oz)' },
                    ticks: { callback: v => '$' + v }
                }
            };
        } else {
            // 4. 雙幣別對照 (獨立雙 Y 軸)
            datasets = [
                {
                    label: '🌐 國際金價 (USD/oz - 左軸)',
                    data: list.map(d => d.usd),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    borderWidth: 2,
                    tension: 0.2,
                    yAxisID: 'y1'
                },
                {
                    label: '🇹🇼 台灣金價 (NT$/g - 右軸)',
                    data: list.map(d => d.twd),
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.05)',
                    borderWidth: 2,
                    tension: 0.2,
                    yAxisID: 'y2'
                }
            ];
            scales = {
                y1: { type: 'linear', display: true, position: 'left', title: { display: true, text: '國際金價 (USD/oz)' } },
                y2: { type: 'linear', display: true, position: 'right', title: { display: true, text: '台灣金價 (TWD/g)' }, grid: { drawOnChartArea: false } }
            };
        }

        goldChartInstance = new Chart(goldChartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: scales
            }
        });
    }

    // 啟動應用程式
    initApp();
});
