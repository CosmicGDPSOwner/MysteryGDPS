(() => {
    'use strict';

    let registry = null;
    let registryRef = null;
    let registryHandler = null;
    let currentProfile = null;
    let currentPublicId = null;
    let gdpsCheckTimer = null;
    let checkedGdpsId = '';
    let checkedGdpsTaken = false;
    let gdpsLinksRef = null;
    let gdpsLinksHandler = null;

    function usernameKey(profile) {
        return String(profile?.usernameKey || profile?.username || '').trim().toLowerCase();
    }

    function showPublicId() {
        const header = document.getElementById('accountProfileHeader');
        if (!header || !currentPublicId) return;
        const userLine = header.querySelector('.account-profile-user');
        if (!userLine) return;
        const base = String(userLine.textContent || '').split(' · ID #')[0];
        userLine.textContent = `${base} · ID #${currentPublicId}`;
    }

    function showIdStatus(text, error = false) {
        const header = document.getElementById('accountProfileHeader');
        if (!header) return;
        let el = header.querySelector('.site-account-id-status');
        if (!el) {
            el = document.createElement('div');
            el.className = 'account-profile-meta site-account-id-status';
            const info = header.querySelector('div:last-child');
            if (info) info.appendChild(el);
        }
        el.textContent = text || '';
        el.style.color = error ? '#ff7b7b' : '';
    }

    async function migrateExistingIdsIfAdmin() {
        if (!auth.currentUser || !window.isAdmin) return false;
        const registrySnap = await db.ref('accountIds').once('value');
        const existing = registrySnap.val();
        if (existing?.initialized === true) return true;

        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};
        const ordered = Object.entries(users)
            .map(([uid, profile]) => ({ uid, profile: profile || {} }))
            .filter(item => usernameKey(item.profile))
            .sort((a, b) => {
                const ta = Number(a.profile.createdAt || 0);
                const tb = Number(b.profile.createdAt || 0);
                if (ta !== tb) return ta - tb;
                return usernameKey(a.profile).localeCompare(usernameKey(b.profile));
            });

        const byUsername = {};
        const byId = {};
        ordered.forEach((item, index) => {
            const id = index + 1;
            const key = usernameKey(item.profile);
            byUsername[key] = id;
            byId[String(id)] = key;
        });

        await db.ref('accountIds').set({
            initialized: true,
            counter: ordered.length,
            byUsername,
            byId,
            initializedAt: firebase.database.ServerValue.TIMESTAMP
        });
        return true;
    }

    async function allocateCurrentId() {
        const user = auth.currentUser;
        if (!user || !currentProfile) return null;
        const key = usernameKey(currentProfile);
        if (!key) return null;

        let snap = await db.ref('accountIds').once('value');
        let value = snap.val();

        if (value?.initialized !== true) {
            if (window.isAdmin) {
                try {
                    await migrateExistingIdsIfAdmin();
                    snap = await db.ref('accountIds').once('value');
                    value = snap.val();
                } catch (error) {
                    console.error('[Night GDPS] Account ID migration failed:', error);
                    showIdStatus('Не удалось инициализировать ID аккаунтов.', true);
                    return null;
                }
            } else {
                showIdStatus('ID аккаунта будет назначен автоматически после инициализации системы.');
                return null;
            }
        }

        if (Number.isInteger(value?.byUsername?.[key])) {
            return value.byUsername[key];
        }

        try {
            const tx = await db.ref('accountIds').transaction(current => {
                if (!current || current.initialized !== true) return;
                current.byUsername = current.byUsername || {};
                current.byId = current.byId || {};
                if (Number.isInteger(current.byUsername[key])) return current;

                const next = Math.max(0, Number(current.counter) || 0) + 1;
                current.counter = next;
                current.byUsername[key] = next;
                current.byId[String(next)] = key;
                return current;
            });

            if (!tx.committed) return null;
            const result = tx.snapshot.val();
            return Number(result?.byUsername?.[key]) || null;
        } catch (error) {
            console.error('[Night GDPS] Account ID allocation failed:', error);
            showIdStatus(
                error?.code === 'PERMISSION_DENIED'
                    ? 'Firebase Rules пока не разрешают назначение ID аккаунта.'
                    : 'Не удалось назначить ID аккаунта.',
                true
            );
            return null;
        }
    }

    async function refreshCurrentId() {
        if (!auth.currentUser) return;
        const snap = await db.ref(`users/${auth.currentUser.uid}`).once('value');
        currentProfile = snap.val();
        if (!currentProfile) return;
        currentPublicId = await allocateCurrentId();
        if (currentPublicId) {
            showIdStatus('');
            showPublicId();
        }
    }

    function attachRegistryListener() {
        if (registryRef && registryHandler) registryRef.off('value', registryHandler);
        registryRef = db.ref('accountIds');
        registryHandler = snap => {
            registry = snap.val() || null;
            const key = usernameKey(currentProfile);
            currentPublicId = Number(registry?.byUsername?.[key]) || currentPublicId || null;
            if (currentPublicId) showPublicId();
        };
        registryRef.on('value', registryHandler, error => {
            console.warn('[Night GDPS] Account ID listener:', error?.message || error);
        });
    }

    function gdpsMessage(text, error = false) {
        const input = document.getElementById('identityClaimAccountId');
        if (!input) return;
        let el = document.getElementById('identityClaimAccountIdHint');
        if (!el) {
            el = document.createElement('div');
            el.id = 'identityClaimAccountIdHint';
            el.className = 'account-hint';
            input.insertAdjacentElement('afterend', el);
        }
        el.textContent = text || '';
        el.style.color = error ? '#ff7b7b' : '';
    }

    async function checkGdpsAccountId(raw) {
        const id = String(raw || '').trim();
        checkedGdpsId = id;
        checkedGdpsTaken = false;

        if (!/^\d{1,20}$/.test(id) || id === '0') {
            gdpsMessage('Введите числовой accountID Night GDPS.');
            return false;
        }

        gdpsMessage('Проверяем accountID...');
        try {
            const snap = await db.ref(`gdpsAccountTaken/${id}`).once('value');
            if (checkedGdpsId !== id) return false;
            checkedGdpsTaken = snap.val() === true;
            gdpsMessage(
                checkedGdpsTaken
                    ? 'Этот Night GDPS accountID уже занят и привязан к другому аккаунту.'
                    : 'accountID свободен для подтверждения.',
                checkedGdpsTaken
            );
            return checkedGdpsTaken;
        } catch (error) {
            console.warn('[Night GDPS] accountID availability check:', error?.message || error);
            gdpsMessage('Не удалось проверить занятость accountID.', true);
            return false;
        }
    }

    function bindGdpsInput() {
        const input = document.getElementById('identityClaimAccountId');
        if (!input || input.dataset.availabilityBound === '1') return;
        input.dataset.availabilityBound = '1';
        input.addEventListener('input', () => {
            clearTimeout(gdpsCheckTimer);
            checkedGdpsTaken = false;
            checkedGdpsId = String(input.value || '').trim();
            gdpsMessage('');
            gdpsCheckTimer = setTimeout(() => checkGdpsAccountId(input.value), 350);
        });
        input.addEventListener('blur', () => checkGdpsAccountId(input.value));
    }

    async function syncTakenIdsForModerator() {
        if (!auth.currentUser || !window.isModerator) return;
        if (gdpsLinksRef) return;

        gdpsLinksRef = db.ref('gdpsAccountLinks');
        gdpsLinksHandler = async snap => {
            const links = snap.val() || {};
            const updates = {};
            Object.keys(links).forEach(id => {
                if (/^\d{1,20}$/.test(id)) updates[id] = true;
            });
            if (!Object.keys(updates).length) return;
            try {
                await db.ref('gdpsAccountTaken').update(updates);
            } catch (error) {
                console.warn('[Night GDPS] Taken accountID sync:', error?.message || error);
            }
        };
        gdpsLinksRef.on('value', gdpsLinksHandler, error => {
            console.warn('[Night GDPS] Private account links listener:', error?.message || error);
        });
    }

    document.addEventListener('click', event => {
        const submit = event.target.closest?.('#identityClaimSubmit');
        if (!submit) return;
        const input = document.getElementById('identityClaimAccountId');
        const id = String(input?.value || '').trim();
        if (checkedGdpsTaken && checkedGdpsId === id) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const error = document.getElementById('identityClaimError');
            if (error) error.textContent = 'Этот Night GDPS accountID уже занят.';
        }
    }, true);

    const observer = new MutationObserver(() => {
        showPublicId();
        bindGdpsInput();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });

    auth.onAuthStateChanged(async user => {
        currentProfile = null;
        currentPublicId = null;
        registry = null;
        checkedGdpsId = '';
        checkedGdpsTaken = false;

        if (registryRef && registryHandler) registryRef.off('value', registryHandler);
        registryRef = null;
        registryHandler = null;
        if (gdpsLinksRef && gdpsLinksHandler) gdpsLinksRef.off('value', gdpsLinksHandler);
        gdpsLinksRef = null;
        gdpsLinksHandler = null;

        if (!user) return;
        attachRegistryListener();

        setTimeout(() => refreshCurrentId().catch(error => {
            console.warn('[Night GDPS] Public ID refresh:', error?.message || error);
        }), 500);

        let attempts = 0;
        const roleTimer = setInterval(() => {
            attempts += 1;
            if (window.isAdmin) {
                clearInterval(roleTimer);
                migrateExistingIdsIfAdmin()
                    .then(() => refreshCurrentId())
                    .catch(error => console.warn('[Night GDPS] ID migration:', error?.message || error));
            } else if (window.isModerator) {
                clearInterval(roleTimer);
                syncTakenIdsForModerator();
            } else if (attempts >= 20) {
                clearInterval(roleTimer);
            }
        }, 250);

        setTimeout(() => {
            if (window.isModerator) syncTakenIdsForModerator();
        }, 1200);
    });

    bindGdpsInput();
})();
