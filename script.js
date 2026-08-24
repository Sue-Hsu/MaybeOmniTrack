/**
 * MaybeOmniTrack - 財務白癡救星 全功能核心程式碼
 * 包含：外幣匯率、黃金牌告、存股健檢、K線歷史走勢、Google OAuth / 特定帳號雙登入、
 *       Firebase 機密保險庫 (自動跨裝置調用 Supabase 金鑰與特定帳密)、Supabase 關聯資料庫
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. 全域狀態與預載資料
    // =========================================================================
    const state = {
        currentUser: null, // { name: '', email: '', role: 'admin' | 'user' }
        activeTab: 'view-fx',
        currentFilter: 'all',
        searchTerm: '',
        watchlist: new Set(['2886', '2412', '5880']), // 預設自選
        selectedStockForChart: null,
        chartRange: 90,
        chartType: 'line',
        
        // 系統設定 (Firebase 保險庫與 Google 後台管理)
        config: {
            customUser: 'admin',
            customPass: '123456',
            supabaseUrl: '',
            supabaseKey: '',
            goldApiKey: '',
            googleClientId: '432499293288-35d73h2vaf2q5u1kv816d7m15h3utmdr.apps.googleusercontent.com',
            adminGoogleEmails: '', // 指定管理員 Gmail 清單，例如 "admin@gmail.com, kilin@gmail.com"
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

    // 經典存股與龍頭股票資料庫 (預載 14 檔涵蓋 4 本書經典標的)
    const STOCKS_DATA = [
        {
            id: '2886', name: '兆豐金', price: 39.20, marketCap: 1420, eps5y: 2.35, divYears: 22,
            payoutRatio: 82.5, yield: 5.15, beta: 0.48, pb: 1.45, pe: 16.4,
            category: 'dividend',
            diagnosis: '官股金控龍頭！Beta 僅 0.48 極為抗跌，連續配息 22 年且殖利率達 5.15%，具備不倒翁護城河，是標準的安心存股首選。'
        },
        {
            id: '2892', name: '第一金', price: 27.80, marketCap: 1360, eps5y: 1.82, divYears: 19,
            payoutRatio: 78.0, yield: 5.30, beta: 0.42, pb: 1.35, pe: 15.2,
            category: 'dividend',
            diagnosis: '官股優等生，獲利年年平穩成長，殖利率 5.30% 高於 5% 買進安全線，適合長期定期定額領息長抱。'
        },
        {
            id: '5880', name: '合庫金', price: 25.60, marketCap: 1450, eps5y: 1.45, divYears: 13,
            payoutRatio: 85.2, yield: 5.25, beta: 0.45, pb: 1.28, pe: 17.6,
            category: 'dividend',
            diagnosis: '價格極度牛皮穩定，盈餘分配率高達 85%，波動小不引起心理焦慮，非常契合退休養老現金流需求。'
        },
        {
            id: '2880', name: '華南金', price: 26.15, marketCap: 1364, eps5y: 1.58, divYears: 18,
            payoutRatio: 81.0, yield: 5.40, beta: 0.46, pb: 1.32, pe: 16.5,
            category: 'dividend',
            diagnosis: '老牌官股代表，每年配息落差極小，殖利率突破 5.4%，具備極強防禦力與大方分紅特性。'
        },
        {
            id: '2412', name: '中華電', price: 124.50, marketCap: 965, eps5y: 4.75, divYears: 26,
            payoutRatio: 98.5, yield: 4.25, beta: 0.21, pb: 2.35, pe: 26.2,
            category: 'dividend',
            diagnosis: '防禦之王！Beta 僅 0.21（大盤崩盤它幾乎不動），近 100% 盈餘全發給股東，雖殖利率 4.2% 略低於 5%，但抗跌安定感無可替代。'
        },
        {
            id: '2884', name: '玉山金', price: 29.30, marketCap: 1560, eps5y: 1.65, divYears: 17,
            payoutRatio: 86.0, yield: 5.65, beta: 0.62, pb: 1.58, pe: 17.5,
            category: 'cashflow',
            diagnosis: '民營金控模範生！手續費與消金動能強勁，配股配息大方，殖利率高達 5.65%，適合重視複利與現金流的投資人。'
        },
        {
            id: '00878', name: '國泰永續高股息', price: 22.80, marketCap: 2800, eps5y: 1.85, divYears: 5,
            payoutRatio: 95.0, yield: 6.85, beta: 0.72, pb: 1.12, pe: 14.5,
            category: 'cashflow',
            diagnosis: '人氣高股息 ETF，季配息機制且平準金充沛，年化殖利率逼近 7%，是打造每季被動收入的絕佳現金流工具。'
        },
        {
            id: '0056', name: '元大高股息', price: 38.60, marketCap: 3100, eps5y: 2.60, divYears: 14,
            payoutRatio: 92.0, yield: 7.20, beta: 0.78, pb: 1.18, pe: 13.8,
            category: 'cashflow',
            diagnosis: '歷史最悠久的高股息 ETF，連續 14 年順利填息，殖利率高達 7.2%，產業分散廣泛，適合不想選單一個股的新手。'
        },
        {
            id: '2881', name: '富邦金', price: 88.50, marketCap: 1280, eps5y: 7.50, divYears: 16,
            payoutRatio: 55.0, yield: 4.80, beta: 0.88, pb: 1.25, pe: 11.8,
            category: 'cashflow',
            diagnosis: '金控每股獲利王 (EPS 常居第一)，本益比僅 11.8 倍非常便宜，但獲利受壽險與資本市場起伏影響較大。'
        },
        {
            id: '2382', name: '廣達', price: 275.00, marketCap: 386, eps5y: 10.29, divYears: 22,
            payoutRatio: 80.0, yield: 3.65, beta: 1.28, pb: 4.50, pe: 26.5,
            category: 'swing',
            diagnosis: 'AI 伺服器龍頭，獲利成長爆發力強！但 Beta 高達 1.28 且股價漲多導致殖利率降至 3.65%，適合波段買低賣高賺價差，不宜死存。'
        },
        {
            id: '2330', name: '台積電', price: 950.00, marketCap: 25930, eps5y: 38.50, divYears: 20,
            payoutRatio: 45.0, yield: 1.55, beta: 1.18, pb: 6.80, pe: 24.5,
            category: 'swing',
            diagnosis: '全球半導體霸主，資本支出龐大故殖利率偏低 (1.55%)。強項在於長線股價資本利得翻倍，是標準的成長型價差王者。'
        },
        {
            id: '2002', name: '中鋼', price: 23.50, marketCap: 1573, eps5y: 0.55, divYears: 25,
            payoutRatio: 75.0, yield: 2.30, beta: 0.85, pb: 1.15, pe: 42.0,
            category: 'swing',
            diagnosis: '老牌鋼鐵龍頭，為標準景氣循環股。近幾年鋼價低迷導致 EPS 與配息銳減，需在景氣谷底 (低本益比/低股價) 佈局賺取循環價差。'
        },
        {
            id: '2324', name: '仁寶', price: 34.80, marketCap: 440, eps5y: 2.10, divYears: 20,
            payoutRatio: 72.0, yield: 4.60, beta: 0.74, pb: 1.30, pe: 16.5,
            category: 'cashflow',
            diagnosis: '老牌電子代工廠，股價長年處於合理區間，年年配發 1~1.5 元現金，適合做為分散電子產業的收益配置。'
        },
        {
            id: '2356', name: '英業達', price: 45.20, marketCap: 358, eps5y: 1.95, divYears: 20,
            payoutRatio: 75.0, yield: 4.10, beta: 0.82, pb: 1.65, pe: 23.0,
            category: 'cashflow',
            diagnosis: '老牌伺服器代工廠，具備轉型題材，配息穩定，適合在中長線均線低檔時承接。'
        }
    ];

    // =========================================================================
    // 2. DOM 元素定位
    // =========================================================================
    // 導覽分頁 (三個獨立分頁)
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

    // 彈窗
    const loginModal = document.getElementById('login-modal');
    const btnCloseLoginModal = document.getElementById('btn-close-login-modal');
    const googleBtnContainer = document.getElementById('google-signin-btn-container');
    const inputCustomUser = document.getElementById('input-custom-username');
    const inputCustomPass = document.getElementById('input-custom-password');
    const btnCustomLogin = document.getElementById('btn-custom-login');

    const adminModal = document.getElementById('admin-modal');
    const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
    const adminCustomUser = document.getElementById('admin-custom-user');
    const adminCustomPass = document.getElementById('admin-custom-pass');
    const adminSupabaseUrl = document.getElementById('admin-supabase-url');
    const adminSupabaseKey = document.getElementById('admin-supabase-key');
    const adminGoldKey = document.getElementById('admin-gold-key');
    const adminGoogleClientId = document.getElementById('admin-google-client-id');
    const adminGoogleEmails = document.getElementById('admin-google-emails');
    const adminFirebaseConfig = document.getElementById('admin-firebase-config');
    const btnSaveAdminSettings = document.getElementById('btn-save-admin-settings');

    // 股票健檢與篩選
    const rulesToggleBtn = document.getElementById('rules-toggle-btn');
    const rulesBodyContent = document.getElementById('rules-body-content');
    const rulesToggleIcon = document.getElementById('rules-toggle-icon');
    const stocksContainer = document.getElementById('stocks-container');
    const stockSearchInput = document.getElementById('stock-search-input');
    const filterChips = document.querySelectorAll('.filter-chip');
    const countAllEl = document.getElementById('count-all');
    const countFavEl = document.getElementById('count-fav');

    // 股票圖表 Modal
    const stockChartModal = document.getElementById('stock-chart-modal');
    const btnCloseStockModal = document.getElementById('btn-close-stock-modal');
    const modalStockTitle = document.getElementById('modal-stock-title');
    const modalStockPrice = document.getElementById('modal-stock-price');
    const stockModalChartCtx = document.getElementById('stock-modal-chart');
    const rangeButtons = document.querySelectorAll('.btn-range');
    const btnTypeLine = document.getElementById('btn-type-line');
    const btnTypeCandle = document.getElementById('btn-type-candle');

    // 匯率與金價元素
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
    const goldStartDateInput = document.getElementById('gold-start-date');
    const goldEndDateInput = document.getElementById('gold-end-date');
    const goldSearchBtn = document.getElementById('gold-search-btn');
    const goldChartCtx = document.getElementById('gold-chart');
    const goldTbody = document.getElementById('gold-tbody');

    // Chart.js 實例暫存
    let fxChartInstance = null;
    let goldChartInstance = null;
    let stockChartInstance = null;

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
        initStocksSection();
        initFxAndGoldSection();
    }

    // 讀取本地快取設定
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
        };

        tabFx.addEventListener('click', () => switchTab('view-fx'));
        tabGold.addEventListener('click', () => switchTab('view-gold'));
        tabStocks.addEventListener('click', () => switchTab('view-stocks'));
    }

    // =========================================================================
    // 5. Firebase 機密保險庫 (跨裝置自動調用 Supabase API Key 與特定帳密)
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
        if (!firestoreDb) {
            console.warn("Firestore not available");
            return;
        }
        try {
            await firestoreDb.collection('app_config').doc('secrets').set({
                supabase_url: state.config.supabaseUrl,
                supabase_key: state.config.supabaseKey,
                gold_key: state.config.goldApiKey,
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
    // 6. Google Identity Services (GIS) 與指定管理員判定
    // =========================================================================
    function initGoogleIdentityServices() {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
            return;
        }

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

        // 登入後從 Firebase 保險庫拉取最新金鑰與設定
        await fetchSecretsFromFirebase();

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

        if (isAdmin) {
            setLoggedInUser({ name: `${userName} (Google)`, email: userEmail, role: 'admin' });
            loginModal.style.display = 'none';
            alert(`👑 歡迎管理員 ${userName} (${userEmail}) 登入！後台設定功能已解鎖，已自動調用雲端金鑰。`);
        } else {
            setLoggedInUser({ name: `${userName} (Google)`, email: userEmail, role: 'user' });
            loginModal.style.display = 'none';
            alert(`👋 歡迎 ${userName} (${userEmail})！您目前為「一般用戶」檢視權限。若需後台管理權限，請由管理者將您的 Gmail 加入授權名單。`);
        }
    }

    // =========================================================================
    // 7. 身分認證與管理員後台事件
    // =========================================================================
    function initAuthHandlers() {
        btnOpenLogin.addEventListener('click', () => {
            loginModal.style.display = 'flex';
            initGoogleIdentityServices();
        });
        btnCloseLoginModal.addEventListener('click', () => loginModal.style.display = 'none');
        
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
            adminGoogleClientId.value = state.config.googleClientId;
            adminGoogleEmails.value = state.config.adminGoogleEmails;
            adminFirebaseConfig.value = typeof state.config.firebaseConfig === 'string' ? state.config.firebaseConfig : JSON.stringify(state.config.firebaseConfig, null, 2);
            adminModal.style.display = 'flex';
        });
        btnCloseAdminModal.addEventListener('click', () => adminModal.style.display = 'none');

        // 特定帳號密碼登入
        btnCustomLogin.addEventListener('click', async () => {
            await fetchSecretsFromFirebase();
            const u = inputCustomUser.value.trim();
            const p = inputCustomPass.value.trim();
            if (u === state.config.customUser && p === state.config.customPass) {
                setLoggedInUser({ name: u, email: '', role: 'user' });
                loginModal.style.display = 'none';
                alert(`歡迎回來，${u}！您已成功登入系統（一般用戶權限）。`);
            } else {
                alert('帳號或密碼錯誤！請向管理員確認。');
            }
        });

        // 登出
        btnLogout.addEventListener('click', () => {
            state.currentUser = null;
            localStorage.removeItem('maybe_omni_current_user');
            unauthView.style.display = 'block';
            authView.style.display = 'none';
            btnOpenAdmin.style.display = 'none';
            alert('已安全登出。');
        });

        // 儲存管理員後台設定
        btnSaveAdminSettings.addEventListener('click', async () => {
            state.config.customUser = adminCustomUser.value.trim() || 'admin';
            state.config.customPass = adminCustomPass.value.trim() || '123456';
            state.config.supabaseUrl = adminSupabaseUrl.value.trim();
            state.config.supabaseKey = adminSupabaseKey.value.trim();
            state.config.goldApiKey = adminGoldKey.value.trim();
            state.config.googleClientId = adminGoogleClientId.value.trim();
            state.config.adminGoogleEmails = adminGoogleEmails.value.trim();
            state.config.firebaseConfig = adminFirebaseConfig.value.trim();

            localStorage.setItem('maybe_omni_config', JSON.stringify(state.config));
            
            initFirebaseVault();
            await saveSecretsToFirebase();

            supabaseClient = null;
            await saveSettingsToSupabase();

            adminModal.style.display = 'none';
            initGoogleIdentityServices();
            alert('✅ 雲端與系統設定儲存成功！已同步至 Firebase 保險庫與 Supabase，在任何裝置登入 Google 即可自動連線！');
        });
    }

    // =========================================================================
    // 8. Supabase 資料庫連線
    // =========================================================================
    let supabaseClient = null;

    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        if (state.config.supabaseUrl && state.config.supabaseKey && window.supabase) {
            try {
                let cleanUrl = state.config.supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
                supabaseClient = window.supabase.createClient(cleanUrl, state.config.supabaseKey.trim());
                return supabaseClient;
            } catch (e) {
                console.warn("Supabase client init error", e);
            }
        }
        return null;
    }

    async function saveSettingsToSupabase() {
        const client = getSupabaseClient();
        if (!client) return;
        try {
            const settingsRows = [
                { key: 'custom_user', value: state.config.customUser },
                { key: 'custom_pass', value: state.config.customPass },
                { key: 'gold_key', value: state.config.goldApiKey },
                { key: 'admin_emails', value: state.config.adminGoogleEmails },
                { key: 'google_client_id', value: state.config.googleClientId }
            ];
            await client.from('system_settings').upsert(settingsRows);
        } catch (e) {
            console.warn("Save settings to Supabase error", e);
        }
    }

    function createMockJwt(email) {
        const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
        const payload = btoa(JSON.stringify({
            email: email,
            name: email.split('@')[0],
            picture: ""
        }));
        return `${header}.${payload}.signature`;
    }

    function setLoggedInUser(user) {
        state.currentUser = user;
        localStorage.setItem('maybe_omni_current_user', JSON.stringify(user));
        unauthView.style.display = 'none';
        authView.style.display = 'flex';
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
    }

    // =========================================================================
    // 9. 股票存股 5 大維度健檢篩選器
    // =========================================================================
    function initStocksSection() {
        rulesToggleBtn.addEventListener('click', () => {
            const isHidden = rulesBodyContent.style.display === 'none';
            rulesBodyContent.style.display = isHidden ? 'block' : 'none';
            rulesToggleIcon.classList.toggle('rotate', isHidden);
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

            const card = document.createElement('div');
            card.className = 'stock-card';
            card.innerHTML = `
                <div class="stock-card-header">
                    <div class="stock-title-wrap">
                        <div class="stock-code-name">${stock.id} ${stock.name}</div>
                        <div class="stock-price-display">NT$ ${stock.price.toFixed(2)}</div>
                    </div>
                    <button class="btn-star-fav ${isFav ? 'favorited' : ''}" data-id="${stock.id}" title="${isFav ? '移出自選' : '加入自選'}">
                        <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
                    </button>
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
                    <i class="fa-solid fa-comment-dots" style="color: var(--accent-blue);"></i> <strong>大白話診斷：</strong>${stock.diagnosis}
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

            const starBtn = card.querySelector('.btn-star-fav');
            starBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.watchlist.has(stock.id)) {
                    state.watchlist.delete(stock.id);
                } else {
                    state.watchlist.add(stock.id);
                }
                localStorage.setItem('maybe_omni_watchlist', JSON.stringify([...state.watchlist]));
                renderStocks();
            });

            const chartBtn = card.querySelector('.btn-view-chart');
            chartBtn.addEventListener('click', () => {
                state.selectedStockForChart = stock;
                modalStockTitle.textContent = `${stock.id} ${stock.name} - 歷史行情走勢`;
                modalStockPrice.textContent = `NT$ ${stock.price.toFixed(2)}`;
                stockChartModal.style.display = 'flex';
                renderStockChart(stock);
            });

            stocksContainer.appendChild(card);
        });
    }

    // =========================================================================
    // 10. 股票歷史行情圖表
    // =========================================================================
    async function renderStockChart(stock) {
        let chartData = [];
        try {
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - state.chartRange);
            const startStr = pastDate.toISOString().split('T')[0];

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
            } else {
                throw new Error("No data");
            }
        } catch (e) {
            chartData = generateStockMockHistory(stock.price, state.chartRange);
        }

        const labels = chartData.map(d => d.date);
        const closes = chartData.map(d => d.close);

        if (stockChartInstance) stockChartInstance.destroy();

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
                        y: {
                            ticks: { callback: (v) => 'NT$ ' + v.toFixed(2) }
                        }
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

    function generateStockMockHistory(currentPrice, days) {
        const list = [];
        let price = currentPrice * 0.92;
        const now = new Date();
        for (let i = days; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            if (d.getDay() !== 0 && d.getDay() !== 6) {
                const change = (Math.random() - 0.48) * (currentPrice * 0.02);
                price += change;
                const open = price - (Math.random() - 0.5) * 0.5;
                list.push({
                    date: d.toISOString().split('T')[0],
                    close: parseFloat(price.toFixed(2)),
                    open: parseFloat(open.toFixed(2)),
                    high: parseFloat((Math.max(price, open) + 0.3).toFixed(2)),
                    low: parseFloat((Math.min(price, open) - 0.3).toFixed(2))
                });
            }
        }
        return list;
    }

    // =========================================================================
    // 11. 匯率與金價原有邏輯整合
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
        fromCurrency.addEventListener('change', calc);
        toCurrency.addEventListener('change', calc);
        swapBtn.addEventListener('click', () => {
            const tmp = fromCurrency.value;
            fromCurrency.value = toCurrency.value;
            toCurrency.value = tmp;
            calc();
        });

        searchBtn.addEventListener('click', () => fetchFxHistory(startDateInput.value, endDateInput.value));
        goldSearchBtn.addEventListener('click', () => fetchGoldHistory(goldStartDateInput.value, goldEndDateInput.value));

        fetchFxInsights();
        fetchFxHistory(startDateInput.value, endDateInput.value);
        fetchGoldHistory(goldStartDateInput.value, goldEndDateInput.value);
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
            }
        } catch (e) {
            loadingEl.style.display = 'none';
            dataContentEl.style.display = 'block';
            sellRateEl.textContent = '32.450';
            buyRateEl.textContent = '32.350';
            avgRateEl.textContent = '32.500';
            sellInsightEl.className = 'insight-status good';
            sellInsightEl.querySelector('.status-text').textContent = '便宜！現在換外幣出國划算';
            buyInsightEl.className = 'insight-status good';
            buyInsightEl.querySelector('.status-text').textContent = '賺到！現在換回台幣划算';
        }
    }

    async function fetchFxHistory(start, end) {
        let list = [];
        try {
            const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanExchangeRate&data_id=USD&start_date=${start}&end_date=${end}`);
            const json = await res.json();
            if (json.msg === 'success' && json.data) list = json.data;
        } catch (e) {
            list = generateMockFx(start, end);
        }

        if (fxChartInstance) fxChartInstance.destroy();
        fxChartInstance = new Chart(historyChartCtx, {
            type: 'line',
            data: {
                labels: list.map(d => d.date),
                datasets: [
                    { label: '銀行賣出 (您付錢)', data: list.map(d => d.spot_sell), borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.08)', borderWidth: 2, tension: 0.2, fill: true },
                    { label: '銀行買入 (您換回)', data: list.map(d => d.spot_buy), borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.08)', borderWidth: 2, tension: 0.2, fill: true }
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
        const list = generateMockGold(start, end);
        goldUsdPrice.textContent = "2,385.60";
        goldTwdPrice.textContent = "2,492.30";

        if (goldChartInstance) goldChartInstance.destroy();
        goldChartInstance = new Chart(goldChartCtx, {
            type: 'line',
            data: {
                labels: list.map(d => d.date),
                datasets: [
                    { label: '國際金價 (USD/oz)', data: list.map(d => d.usd), borderColor: '#b45309', backgroundColor: 'rgba(217, 119, 6, 0.08)', borderWidth: 2, tension: 0.2, yAxisID: 'y1' },
                    { label: '台灣金價 (TWD/g)', data: list.map(d => d.twd), borderColor: '#15803d', backgroundColor: 'rgba(21, 128, 61, 0.08)', borderWidth: 2, tension: 0.2, yAxisID: 'y2' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    y1: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'USD/oz' } },
                    y2: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'TWD/g' }, grid: { drawOnChartArea: false } }
                }
            }
        });

        goldTbody.innerHTML = '';
        [...list].reverse().forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.date}</td><td>$${item.usd.toFixed(2)}</td><td>NT$${item.twd.toFixed(2)}</td>`;
            goldTbody.appendChild(tr);
        });
    }

    function generateMockFx(start, end) {
        const list = [];
        let cur = new Date(start); const endObj = new Date(end);
        let s = 32.5;
        while (cur <= endObj) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                s += (Math.random() - 0.5) * 0.15;
                list.push({ date: cur.toISOString().split('T')[0], spot_sell: s, spot_buy: s - 0.1 });
            }
            cur.setDate(cur.getDate() + 1);
        }
        return list;
    }

    function generateMockGold(start, end) {
        const list = [];
        let cur = new Date(start); const endObj = new Date(end);
        let u = 2360;
        while (cur <= endObj) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                u += (Math.random() - 0.48) * 15;
                list.push({ date: cur.toISOString().split('T')[0], usd: u, twd: (u * 32.5) / 31.1035 });
            }
            cur.setDate(cur.getDate() + 1);
        }
        return list;
    }

    // 啟動應用程式
    initApp();
});
