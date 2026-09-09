(function initializeAuthBootstrap() {
    'use strict';

    const SUPABASE_URL = 'https://lazirtsedusnfibztszi.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable___SpsrdYZVCWheNWlsQBvA_jIQnVZL4';

    const elements = {
        card: document.getElementById('status-card'),
        dot: document.getElementById('status-dot'),
        title: document.getElementById('status-title'),
        account: document.getElementById('account-value'),
        membership: document.getElementById('membership-value'),
        session: document.getElementById('session-value'),
        message: document.getElementById('status-message'),
        error: document.getElementById('error-detail'),
        signIn: document.getElementById('btn-sign-in'),
        refresh: document.getElementById('btn-refresh'),
        signOut: document.getElementById('btn-sign-out')
    };

    const stateLabels = Object.freeze({
        signed_out: {
            tone: 'warn',
            title: '尚未登入',
            message: '請使用 Google 登入，系統才會驗證家庭權限與應用工作階段。'
        },
        session_error: {
            tone: 'error',
            title: '應用工作階段驗證失敗',
            message: 'Google 身分存在，但 30 天應用工作階段未能建立或更新；主站資料保持鎖定。'
        },
        pending: {
            tone: 'warn',
            title: '帳號等待家庭核准',
            message: 'Google 登入成功，但尚未成為核准家庭成員；主站資料保持鎖定。'
        },
        blocked: {
            tone: 'error',
            title: '帳號目前不可使用',
            message: '家庭 membership 已被停用或拒絕；主站資料保持鎖定。'
        },
        approved_owner: {
            tone: 'ok',
            title: 'Owner 登入驗證成功',
            message: 'Google 身分、owner membership 與應用工作階段均已通過。主站仍維持安全維護，不會在此頁解鎖。'
        },
        approved_admin: {
            tone: 'ok',
            title: '管理員登入驗證成功',
            message: 'Google 身分、管理員 membership 與應用工作階段均已通過。主站仍維持安全維護。'
        },
        approved_member: {
            tone: 'ok',
            title: '家庭成員登入驗證成功',
            message: 'Google 身分、家庭 membership 與應用工作階段均已通過。主站仍維持安全維護。'
        }
    });

    let client = null;
    let refreshRunning = false;

    function setError(error) {
        const message = error && error.message ? error.message : '';
        elements.error.textContent = message;
        elements.error.classList.toggle('hidden', !message);
    }

    function setBusy(isBusy) {
        elements.card.setAttribute('aria-busy', String(isBusy));
        elements.signIn.disabled = isBusy;
        elements.refresh.disabled = isBusy;
        elements.signOut.disabled = isBusy;
    }

    function renderAccess(access, session, membership, sessionTouched, error) {
        const view = stateLabels[access.state] || stateLabels.session_error;
        elements.dot.className = `status-dot ${view.tone}`;
        elements.title.textContent = view.title;
        elements.account.textContent = session && session.user
            ? (session.user.email || 'Google 使用者')
            : '未登入';
        elements.membership.textContent = membership
            ? `${membership.status} / ${membership.role}`
            : (session ? '尚未加入家庭' : '尚未驗證');
        elements.session.textContent = sessionTouched
            ? '有效，活動時間已更新'
            : (session ? '未通過' : '尚未建立');
        elements.message.textContent = view.message;
        setError(error);

        const signedIn = Boolean(session && session.user);
        elements.signIn.classList.toggle('hidden', signedIn);
        elements.refresh.classList.toggle('hidden', !signedIn);
        elements.signOut.classList.toggle('hidden', !signedIn);
        setBusy(false);
    }

    async function readMembership(userId) {
        const { data, error } = await client
            .from('household_memberships')
            .select('household_id, status, role')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async function refreshAccess() {
        if (refreshRunning) return;
        refreshRunning = true;
        setBusy(true);
        setError(null);

        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            const session = data.session;

            if (!session) {
                renderAccess(AuthBootstrapCore.classifyAccess({ session: null }), null, null, false, null);
                return;
            }

            const membership = await readMembership(session.user.id);
            const touchResult = await client.rpc('touch_member_session');
            const sessionTouched = !touchResult.error;
            const access = AuthBootstrapCore.classifyAccess({
                session,
                sessionTouched,
                membership
            });
            renderAccess(access, session, membership, sessionTouched, touchResult.error);
        } catch (error) {
            renderAccess(
                AuthBootstrapCore.classifyAccess({ session: { user: {} }, sessionTouched: false }),
                null,
                null,
                false,
                error
            );
        } finally {
            refreshRunning = false;
            setBusy(false);
        }
    }

    async function signIn() {
        setBusy(true);
        setError(null);
        const redirectTo = AuthBootstrapCore.getDirectoryUrl(window.location.href);
        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo }
        });
        if (error) {
            setBusy(false);
            setError(error);
        }
    }

    async function signOut() {
        setBusy(true);
        setError(null);

        const revokeResult = await client.rpc('revoke_current_member_session');
        const revokeError = revokeResult.error || (revokeResult.data !== true
            ? new Error('應用工作階段可能已失效或未能撤銷。')
            : null);

        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) {
            setBusy(false);
            setError(error);
            return;
        }
        await refreshAccess();
        if (revokeError) {
            setError(new Error(`已從此瀏覽器登出，但${revokeError.message}`));
        }
    }

    function start() {
        if (!window.supabase || !window.AuthBootstrapCore) {
            renderAccess(
                { state: 'session_error', canEnterApp: false },
                null,
                null,
                false,
                new Error('登入元件載入失敗，請重新整理後再試。')
            );
            return;
        }

        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });

        elements.signIn.addEventListener('click', signIn);
        elements.refresh.addEventListener('click', refreshAccess);
        elements.signOut.addEventListener('click', signOut);
        client.auth.onAuthStateChange(() => {
            window.setTimeout(refreshAccess, 0);
        });
        refreshAccess();
    }

    start();
}());
