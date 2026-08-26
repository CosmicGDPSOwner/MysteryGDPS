(() => {
    'use strict';

    const cfg = window.NIGHT_TURNSTILE_CONFIG || {};
    let resolveAccess;
    let rejectAccess;
    let initialized = false;
    let unlocked = false;
    let turnstileWidgetId = null;

    const accessPromise = new Promise((resolve, reject) => {
        resolveAccess = resolve;
        rejectAccess = reject;
    });

    const api = window.NightAccessGate = {
        waitForAccess: () => accessPromise,
        isUnlocked: () => unlocked,
        clearSession() {
            try { localStorage.removeItem(cfg.sessionStorageKey || 'night_gdps_access_v1'); } catch (_) {}
        }
    };

    const $ = id => document.getElementById(id);
    const status = (text, isError = false) => {
        const el = $('nightAccessStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('error', !!isError);
    };

    const normalizeWorkerUrl = () => String(cfg.workerBaseUrl || '').replace(/\/+$/, '');


    function saveSession(sessionToken, expiresAt) {
        try {
            localStorage.setItem(cfg.sessionStorageKey || 'night_gdps_access_v1', JSON.stringify({
                token: String(sessionToken || ''),
                expiresAt: Number(expiresAt || 0)
            }));
        } catch (_) {}
    }

    function loadSession() {
        try {
            const raw = localStorage.getItem(cfg.sessionStorageKey || 'night_gdps_access_v1');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.token || Number(parsed.expiresAt || 0) <= Date.now()) {
                localStorage.removeItem(cfg.sessionStorageKey || 'night_gdps_access_v1');
                return null;
            }
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function unlock() {
        if (unlocked) return;
        unlocked = true;
        document.documentElement.classList.remove('night-access-locked');
        const gate = $('nightAccessGate');
        if (gate) gate.hidden = true;
        document.body.style.overflow = '';
        resolveAccess(true);
    }

    async function workerFetch(path, body) {
        const base = normalizeWorkerUrl();
        if (!base) throw new Error('Worker URL is not configured');
        const response = await fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            cache: 'no-store',
            credentials: 'omit'
        });
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!response.ok) {
            const err = new Error(data?.error || 'Access verification failed');
            err.status = response.status;
            throw err;
        }
        return data || {};
    }

    async function verifyStoredSession() {
        const saved = loadSession();
        if (!saved) return false;
        status('Проверяем сохранённую сессию...');
        try {
            const result = await workerFetch('/session', { sessionToken: saved.token });
            if (!result.valid) throw new Error('Session expired');
            if (result.expiresAt) saveSession(saved.token, result.expiresAt);
            unlock();
            return true;
        } catch (_) {
            api.clearSession();
            return false;
        }
    }

    function loadTurnstileScript() {
        if (window.turnstile) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-night-turnstile-api]');
            if (existing) {
                const started = Date.now();
                const timer = setInterval(() => {
                    if (window.turnstile) { clearInterval(timer); resolve(); }
                    else if (Date.now() - started > 12000) { clearInterval(timer); reject(new Error('Turnstile load timeout')); }
                }, 80);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.dataset.nightTurnstileApi = '1';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Turnstile API failed to load'));
            document.head.appendChild(script);
        });
    }

    async function submitTurnstileToken(token) {
        status('Подтверждаем проверку...');
        try {
            const data = await workerFetch('/verify', { turnstileToken: token });
            if (!data.sessionToken || !data.expiresAt) throw new Error('Invalid gateway response');
            saveSession(data.sessionToken, data.expiresAt);
            status('Проверка пройдена.');
            unlock();
        } catch (error) {
            status(error.message || 'Не удалось подтвердить проверку.', true);
            if (window.turnstile && turnstileWidgetId !== null) {
                setTimeout(() => {
                    try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
                }, 900);
            }
        }
    }

    async function showChallenge() {

        if (!cfg.siteKey) {
            status('Turnstile site key не настроен.', true);
            return;
        }

        try {
            status('Загружаем проверку...');
            await loadTurnstileScript();
            const mount = $('nightTurnstileMount');
            if (!mount) throw new Error('Turnstile container is missing');
            mount.innerHTML = '';
            turnstileWidgetId = window.turnstile.render(mount, {
                sitekey: cfg.siteKey,
                theme: 'dark',
                size: 'normal',
                appearance: 'always',
                callback: submitTurnstileToken,
                'error-callback': () => status('Cloudflare не смог выполнить проверку. Попробуйте ещё раз.', true),
                'expired-callback': () => status('Проверка истекла. Выполните её повторно.', true),
                'timeout-callback': () => status('Время проверки истекло. Выполните её повторно.', true)
            });
            status('');
        } catch (error) {
            status(error.message || 'Не удалось загрузить Cloudflare Turnstile.', true);
        }
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        document.body.style.overflow = 'hidden';


        if (await verifyStoredSession()) return;
        await showChallenge();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
