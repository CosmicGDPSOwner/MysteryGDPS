(() => {
    'use strict';

    const COUNTRY_CODES = ["AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW"];
    const VALID_COUNTRY = /^[A-Z]{2}$/;
    let profileRef = null;
    let profileHandler = null;
    let latestProfile = null;
    let lastResolvedUid = null;
    let lastResolvedCountry = '';
    let lastSyncedSignature = '';

    function flag(code) {
        if (!VALID_COUNTRY.test(String(code || '').toUpperCase())) return '';
        return String(code).toUpperCase().replace(/./g, ch =>
            String.fromCodePoint(127397 + ch.charCodeAt(0))
        );
    }

    function countryName(code) {
        try {
            if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
                return new Intl.DisplayNames(['ru'], { type: 'region' }).of(code) || code;
            }
        } catch (_) {}
        return code;
    }

    function countryOptions() {
        return COUNTRY_CODES
            .map(code => ({ code, name: countryName(code) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
            .map(item => `<option value="${item.code}">${flag(item.code)} ${item.name}</option>`)
            .join('');
    }

    function stripUidLabels(root = document) {
        const replacements = [
            ['Официальные данные закреплены за Firebase UID и не редактируются через настройки профиля.',
             'Официальные данные подтверждены и не редактируются через настройки профиля.'],
            ['Заявка всегда привязывается к текущему Firebase UID. Статус и решение модератора нельзя изменить из пользовательского интерфейса.',
             'Заявка всегда привязывается к текущему аккаунту сайта. Статус и решение модератора нельзя изменить из пользовательского интерфейса.'],
            ['Привязка Firebase UID к Night GDPS accountID и официальному профилю Demon List.',
             'Проверка привязки аккаунта сайта к Night GDPS accountID и официальному профилю Demon List.']
        ];

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            let value = node.nodeValue || '';
            replacements.forEach(([from, to]) => {
                if (value.includes(from)) value = value.replaceAll(from, to);
            });
            node.nodeValue = value;
        });

        root.querySelectorAll?.('.moderation-info').forEach(item => {
            const label = item.querySelector('span')?.textContent?.trim();
            if (label === 'Firebase UID' || label === 'UID') item.remove();
        });
    }

    function removeAvatarUi() {
        const avatarInput = document.getElementById('accountAvatar');
        if (avatarInput) {
            const field = avatarInput.closest('.account-field');
            if (field) field.style.display = 'none';
        }
        document.querySelectorAll('.account-avatar').forEach(el => el.remove());
    }

    function removeManualCountryAdminUi() {
        document.querySelectorAll('option[value="set_country"]').forEach(option => option.remove());
        const fields = document.getElementById('fields_country');
        if (fields) fields.remove();
    }

    function ensureCountryField() {
        if (document.getElementById('accountCountry')) return document.getElementById('accountCountry');

        const avatarInput = document.getElementById('accountAvatar');
        const bioInput = document.getElementById('accountBio');
        const anchor = avatarInput?.closest('.account-field') || bioInput?.closest('.account-field');
        const parent = anchor?.parentElement;
        if (!parent) return null;

        const field = document.createElement('div');
        field.className = 'account-field';
        field.id = 'accountCountryField';
        field.innerHTML = `
            <label class="account-label" for="accountCountry">Страна</label>
            <select class="account-input" id="accountCountry">
                <option value="">Выберите страну</option>
                ${countryOptions()}
            </select>
            <div class="account-hint">Страна отображается флагом в профиле и рейтингах. Вы можете изменить её самостоятельно.</div>
            <div id="accountCountryMessage" class="account-form-success" style="margin-top:6px;"></div>`;

        anchor.insertAdjacentElement('afterend', field);
        const select = field.querySelector('#accountCountry');
        select.addEventListener('change', () => saveCountry(select.value));
        return select;
    }

    function message(text, error = false) {
        const el = document.getElementById('accountCountryMessage');
        if (!el) return;
        el.textContent = text || '';
        el.className = error ? 'account-form-error' : 'account-form-success';
    }

    async function readPlayers() {
        try {
            const snap = await db.ref('players').once('value');
            return snap.val() || {};
        } catch (_) {
            return {};
        }
    }

    function profileNames(profile) {
        return [
            profile?.verifiedDemonListUsername,
            profile?.verifiedGdpsUsername,
            profile?.demonListUsername,
            profile?.gdpsUsername
        ].map(v => String(v || '').trim()).filter(Boolean);
    }

    async function resolveCountry(profile) {
        const own = String(profile?.country || '').toUpperCase();
        if (VALID_COUNTRY.test(own)) return own;

        const uid = auth.currentUser?.uid || '';
        if (uid && uid === lastResolvedUid && lastResolvedCountry) return lastResolvedCountry;

        const players = await readPlayers();
        const byLower = new Map(Object.entries(players).map(([key, value]) => [key.toLowerCase(), value]));
        for (const name of profileNames(profile)) {
            const data = byLower.get(name.toLowerCase());
            const code = String(data?.country || '').toUpperCase();
            if (VALID_COUNTRY.test(code)) {
                lastResolvedUid = uid;
                lastResolvedCountry = code;
                return code;
            }
        }
        return '';
    }

    async function resolvePlayerKey(profile) {
        if (!profile?.identityVerified) return '';
        const preferred = [
            profile.verifiedDemonListUsername,
            profile.verifiedGdpsUsername
        ].map(v => String(v || '').trim()).filter(Boolean);
        if (!preferred.length) return '';

        const players = await readPlayers();
        const keys = Object.keys(players);
        for (const name of preferred) {
            const exact = keys.find(k => k.toLowerCase() === name.toLowerCase());
            if (exact) return exact;
        }
        return preferred[0];
    }

    async function syncVerifiedCountry(profile, code) {
        if (!profile?.identityVerified || !VALID_COUNTRY.test(code)) return;
        let key = await resolvePlayerKey(profile);
        if (!key) return;

        const allowedNames = [
            String(profile.verifiedDemonListUsername || '').trim(),
            String(profile.verifiedGdpsUsername || '').trim()
        ].filter(Boolean);
        if (!allowedNames.includes(key)) {
            const exactCase = allowedNames.find(name => name.toLowerCase() === key.toLowerCase());
            if (exactCase) key = exactCase;
        }

        const signature = `${auth.currentUser?.uid || ''}|${key}|${code}`;
        if (signature === lastSyncedSignature) return;
        lastSyncedSignature = signature;

        try {
            await db.ref(`players/${key}/country`).set(code);
        } catch (error) {
            lastSyncedSignature = '';
            if (error?.code !== 'PERMISSION_DENIED') console.warn('[Night GDPS] Country sync:', error);
        }
    }

    async function refreshCountryUi(profile) {
        latestProfile = profile || null;
        const select = ensureCountryField();
        if (!select || !profile) return;
        const code = await resolveCountry(profile);
        if (document.activeElement !== select) select.value = code || '';
        if (profile.country && profile.identityVerified) {
            syncVerifiedCountry(profile, String(profile.country).toUpperCase());
        }
    }

    async function saveCountry(rawCode) {
        const user = auth.currentUser;
        const code = String(rawCode || '').toUpperCase();
        if (!user) {
            message('Сначала войдите в аккаунт.', true);
            return;
        }
        if (!VALID_COUNTRY.test(code)) {
            message('Выберите страну из списка.', true);
            return;
        }

        const select = document.getElementById('accountCountry');
        if (select) select.disabled = true;
        message('Сохраняем...');

        try {
            const snap = await db.ref(`users/${user.uid}`).once('value');
            const profile = snap.val();
            if (!profile) throw new Error('Профиль пользователя не найден.');

            await db.ref(`users/${user.uid}/country`).set(code);
            latestProfile = { ...profile, country: code };
            lastResolvedUid = user.uid;
            lastResolvedCountry = code;

            if (profile.identityVerified) {
                await syncVerifiedCountry(latestProfile, code);
            }

            message(`Сохранено: ${flag(code)} ${countryName(code)}`);
        } catch (error) {
            console.error('[Night GDPS] Country save failed:', error);
            message(
                error?.code === 'PERMISSION_DENIED'
                    ? 'Firebase Rules пока не разрешают пользователю менять страну.'
                    : (error?.message || 'Не удалось сохранить страну.'),
                true
            );
        } finally {
            if (select) select.disabled = false;
        }
    }

    function applyUiCleanup(root = document) {
        ensureCountryField();
        removeAvatarUi();
        removeManualCountryAdminUi();
        stripUidLabels(root);
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    removeAvatarUi();
                    removeManualCountryAdminUi();
                    stripUidLabels(node);
                }
            }
        }
    });

    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    applyUiCleanup();

    auth.onAuthStateChanged(user => {
        if (profileRef && profileHandler) profileRef.off('value', profileHandler);
        profileRef = null;
        profileHandler = null;
        latestProfile = null;
        lastResolvedUid = null;
        lastResolvedCountry = '';
        lastSyncedSignature = '';

        if (!user) {
            const select = ensureCountryField();
            if (select) select.value = '';
            return;
        }

        profileRef = db.ref(`users/${user.uid}`);
        profileHandler = snap => {
            const profile = snap.val();
            if (profile) refreshCountryUi(profile);
            setTimeout(() => applyUiCleanup(), 0);
        };
        profileRef.on('value', profileHandler, error => {
            console.warn('[Night GDPS] Country profile listener:', error?.message || error);
        });
    });

    window.NightCountryProfile = {
        refresh: () => latestProfile && refreshCountryUi(latestProfile)
    };
})();
