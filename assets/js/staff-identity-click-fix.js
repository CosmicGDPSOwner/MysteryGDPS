(() => {
    'use strict';

    let busy = false;

    const clean = (value, max) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
    const keyOf = value => String(value || '').normalize('NFKC').trim().toLowerCase();
    const safeName = value => {
        const name = String(value || '')
            .normalize('NFKC')
            .replace(/[^A-Za-z0-9_-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[-_]+|[-_]+$/g, '')
            .slice(0, 24);
        return /^[A-Za-z0-9_-]{3,24}$/.test(name) ? name : '';
    };

    async function chooseUsername(user, mod) {
        const uid = String(user.uid || '').replace(/[^A-Za-z0-9]/g, '');
        const candidates = [
            safeName(mod?.nick || (user.email || '').split('@')[0]),
            safeName('staff_' + uid.slice(0, 12)),
            safeName('staff_' + uid.slice(0, 16))
        ].filter(Boolean);

        for (const name of [...new Set(candidates)]) {
            const key = keyOf(name);
            const [reserved, claimed] = await Promise.all([
                db.ref('reservedNames/' + key).once('value'),
                db.ref('usernames/' + key).once('value')
            ]);
            if (!reserved.exists() && (!claimed.exists() || claimed.val() === user.uid)) return name;
        }
        throw new Error('Не удалось подобрать свободный username.');
    }

    async function claimUsername(profile, uid) {
        const key = keyOf(profile.usernameKey || profile.username);
        if (!key) throw new Error('Некорректный username профиля.');
        const ref = db.ref('usernames/' + key);
        const tx = await ref.transaction(current => (current === null || current === uid) ? uid : undefined);
        if (!tx.committed || tx.snapshot.val() !== uid) throw new Error('Username уже занят.');
    }

    async function ensureProfile(user) {
        const profileRef = db.ref('users/' + user.uid);
        let snap = await profileRef.once('value');
        if (snap.exists()) {
            const profile = snap.val();
            await claimUsername(profile, user.uid);
            return profile;
        }

        const modSnap = await db.ref('moderators/' + user.uid).once('value');
        const mod = modSnap.val();
        if (!mod) throw new Error('Не найден профиль пользователя или модератора.');

        const username = await chooseUsername(user, mod);
        const displayName = clean(mod.nick || (user.email || '').split('@')[0] || username, 40) || username;
        const profile = {
            username,
            usernameKey: keyOf(username),
            displayName,
            gdpsUsername: displayName,
            demonListUsername: '',
            avatar: '',
            bio: '',
            role: 'user',
            identityVerified: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        await profileRef.set(profile);
        try {
            await claimUsername(profile, user.uid);
        } catch (error) {
            await profileRef.remove().catch(() => {});
            throw error;
        }

        snap = await profileRef.once('value');
        return snap.val();
    }

    async function repairAndOpen(button) {
        if (busy) return;
        busy = true;
        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = 'Подготавливаем профиль...';

        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Пользователь не авторизован.');
            const profile = await ensureProfile(user);
            if (!profile) throw new Error('Firebase не вернул созданный профиль.');

            currentAccountProfile = profile;
            if (typeof renderAccountSection === 'function') renderAccountSection();
            if (typeof openIdentityClaimModal !== 'function') throw new Error('Функция подтверждения не загружена.');
            openIdentityClaimModal();
        } catch (error) {
            console.error('[Night GDPS] staff identity fix:', error);
            if (typeof showToast === 'function') showToast('Ошибка подтверждения: ' + (error.message || 'неизвестная ошибка'));
        } finally {
            button.disabled = false;
            button.textContent = oldText;
            busy = false;
        }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest?.('#identityClaimButton');
        if (!button) return;

        let fallback = false;
        try { fallback = !currentAccountProfile || !!currentAccountProfile._fallback; }
        catch (_) { fallback = true; }
        if (!fallback) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        repairAndOpen(button);
    }, true);
})();