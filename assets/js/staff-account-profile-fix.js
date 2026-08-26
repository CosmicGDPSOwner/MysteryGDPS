(() => {
    'use strict';

    if (!window.NightAccounts || typeof window.NightAccounts.handleAuthState !== 'function') {
        console.warn('[Night GDPS] Staff profile fix: NightAccounts is not ready.');
        return;
    }

    const originalHandleAuthState = window.NightAccounts.handleAuthState.bind(window.NightAccounts);
    const originalOpenIdentityClaimModal = typeof window.openIdentityClaimModal === 'function'
        ? window.openIdentityClaimModal.bind(window)
        : null;

    let provisioningPromise = null;

    function cleanText(value, max) {
        return String(value || '')
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .trim()
            .slice(0, max);
    }

    function sanitizeUsername(value) {
        const result = String(value || '')
            .normalize('NFKC')
            .replace(/[^A-Za-z0-9_-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[-_]+|[-_]+$/g, '')
            .slice(0, 24);
        return /^[A-Za-z0-9_-]{3,24}$/.test(result) ? result : '';
    }

    async function usernameAvailable(username, uid) {
        const key = username.toLowerCase();
        const [reservedSnap, usernameSnap] = await Promise.all([
            db.ref('reservedNames/' + key).once('value'),
            db.ref('usernames/' + key).once('value')
        ]);
        if (reservedSnap.exists()) return false;
        if (!usernameSnap.exists()) return true;
        return usernameSnap.val() === uid;
    }

    async function chooseStaffUsername(user, modData) {
        const uidSafe = String(user.uid || '').replace(/[^A-Za-z0-9]/g, '');
        const preferred = sanitizeUsername(modData?.nick || (user.email || '').split('@')[0]);
        const candidates = [
            preferred,
            sanitizeUsername('staff_' + uidSafe.slice(0, 12)),
            sanitizeUsername('staff_' + uidSafe.slice(0, 16)),
            sanitizeUsername('u_' + uidSafe.slice(0, 20))
        ].filter(Boolean);

        for (const candidate of [...new Set(candidates)]) {
            if (await usernameAvailable(candidate, user.uid)) return candidate;
        }
        throw new Error('Не удалось подобрать свободный username для профиля.');
    }

    async function ensureStaffSiteProfile(user) {
        if (!user) return null;
        if (provisioningPromise) return provisioningPromise;

        provisioningPromise = (async () => {
            const profileRef = db.ref('users/' + user.uid);
            const existingSnap = await profileRef.once('value');
            if (existingSnap.exists()) return existingSnap.val();

            const modSnap = await db.ref('moderators/' + user.uid).once('value');
            const modData = modSnap.val();
            if (!modData) return null;

            const username = await chooseStaffUsername(user, modData);
            const usernameKey = username.toLowerCase();
            const displayName = cleanText(modData.nick || (user.email || '').split('@')[0] || username, 40) || username;

            // gdpsUsername is required by the current Firebase Rules. This is only a
            // claimed/unverified value; the player can edit it before submitting verification.
            const gdpsUsername = displayName;
            const now = firebase.database.ServerValue.TIMESTAMP;
            const profile = {
                username,
                usernameKey,
                displayName,
                gdpsUsername,
                demonListUsername: '',
                avatar: '',
                bio: '',
                role: 'user',
                identityVerified: false,
                createdAt: now,
                updatedAt: now
            };

            await profileRef.set(profile);

            const claimRef = db.ref('usernames/' + usernameKey);
            const tx = await claimRef.transaction(current => {
                if (current === null || current === user.uid) return user.uid;
                return undefined;
            });

            if (!tx.committed || tx.snapshot.val() !== user.uid) {
                throw new Error('Не удалось закрепить username за аккаунтом.');
            }

            const freshSnap = await profileRef.once('value');
            return freshSnap.val();
        })();

        try {
            return await provisioningPromise;
        } finally {
            provisioningPromise = null;
        }
    }

    window.NightAccounts.handleAuthState = async function patchedHandleAuthState(user) {
        if (user) {
            try {
                await ensureStaffSiteProfile(user);
            } catch (error) {
                console.error('[Night GDPS] Staff profile provisioning failed:', error);
            }
        }
        return originalHandleAuthState(user);
    };

    if (originalOpenIdentityClaimModal) {
        window.openIdentityClaimModal = async function patchedOpenIdentityClaimModal() {
            const user = auth.currentUser;
            if (user && (!currentAccountProfile || currentAccountProfile._fallback)) {
                try {
                    if (typeof showToast === 'function') showToast('Подготавливаем профиль аккаунта...');
                    const profile = await ensureStaffSiteProfile(user);
                    if (profile) await originalHandleAuthState(user);
                } catch (error) {
                    console.error('[Night GDPS] Cannot prepare profile for verification:', error);
                    if (typeof showToast === 'function') {
                        showToast('Не удалось подготовить профиль: ' + (error.message || 'ошибка Firebase'));
                    }
                    return;
                }
            }

            if (!currentAccountProfile || currentAccountProfile._fallback) {
                if (typeof showToast === 'function') {
                    showToast('Для этого аккаунта не найден профиль сайта.');
                }
                return;
            }

            return originalOpenIdentityClaimModal();
        };
    }

    // accounts-records.js has already handled the current auth state before this patch loads.
    // Run it once more so existing moderator accounts are repaired immediately.
    if (auth.currentUser) {
        window.NightAccounts.handleAuthState(auth.currentUser).catch(error => {
            console.error('[Night GDPS] Staff profile refresh failed:', error);
        });
    }
})();
