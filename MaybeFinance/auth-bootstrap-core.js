(function exposeAuthBootstrapCore(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.AuthBootstrapCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthBootstrapCore() {
    'use strict';

    function parseParams(value) {
        return new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
    }

    function isAuthReturn(search, hash) {
        const query = parseParams(search);
        const fragment = parseParams(hash);
        return ['code', 'error', 'error_code'].some(key => query.has(key))
            || ['access_token', 'refresh_token', 'error', 'error_code'].some(key => fragment.has(key));
    }

    function buildAuthTestReturnUrl(target, search, hash) {
        return `${target}${search || ''}${hash || ''}`;
    }

    function getDirectoryUrl(href) {
        const url = new URL(href);
        url.search = '';
        url.hash = '';
        if (!url.pathname.endsWith('/')) {
            url.pathname = url.pathname.replace(/[^/]*$/, '');
        }
        return url.toString();
    }

    function classifyAccess({ session, sessionTouched = false, membership = null } = {}) {
        if (!session || !session.user) {
            return { state: 'signed_out', canEnterApp: false };
        }
        if (!sessionTouched) {
            return { state: 'session_error', canEnterApp: false };
        }
        if (!membership || membership.status === 'pending') {
            return { state: 'pending', canEnterApp: false };
        }
        if (membership.status !== 'approved') {
            return { state: 'blocked', canEnterApp: false };
        }
        if (membership.role === 'owner') {
            return { state: 'approved_owner', canEnterApp: false };
        }
        if (membership.role === 'admin') {
            return { state: 'approved_admin', canEnterApp: false };
        }
        return { state: 'approved_member', canEnterApp: false };
    }

    return Object.freeze({
        isAuthReturn,
        buildAuthTestReturnUrl,
        getDirectoryUrl,
        classifyAccess
    });
}));
