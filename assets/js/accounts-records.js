
        // ===== USER ACCOUNTS & RECORD SUBMISSIONS =====
        let currentAccountProfile = null;
        let currentUserSubmissions = [];
        let userSubmissionQuery = null;
        let userSubmissionHandler = null;
        let moderatorCounterRef = null;
        let moderatorCounterHandler = null;
        let moderationSubmissions = [];
        let moderationRef = null;
        let moderationHandler = null;
        let currentModerationTab = 'pending';
        let selectedRecordRole = 'victor';
        let pendingRecordDecision = { id: null, action: null };
        let currentIdentityClaims = [];
        let identityClaimQuery = null;
        let identityClaimHandler = null;
        let identityModerationClaims = [];
        let identityModerationRef = null;
        let identityModerationHandler = null;
        let identityCounterRef = null;
        let identityCounterHandler = null;
        let currentIdentityModerationTab = 'pending';
        let pendingIdentityDecision = { id: null, action: null };

        function buildFallbackAccountProfile(user, modData) {
            const base = ((modData && modData.nick) || (user.email || '').split('@')[0] || 'user').slice(0, 40);
            return {
                username: base,
                displayName: base,
                gdpsUsername: '',
                demonListUsername: '',
                avatar: '',
                bio: '',
                role: modData ? (modData.role || 'moderator') : 'user',
                identityVerified: false,
                gdpsAccountId: '',
                verifiedGdpsUsername: '',
                verifiedDemonListUsername: '',
                createdAt: 0,
                _fallback: true
            };
        }

        function normalizeIdentityName(value) {
            return String(value || '')
                .normalize('NFKC')
                .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
                .trim()
                .toLowerCase();
        }

        function accountUsernameKey(value) {
            return normalizeIdentityName(value);
        }

        function identityPlayerKey(value) {
            return normalizeIdentityName(value).replace(/[.#$\[\]\/]/g, '_').slice(0, 80);
        }

        function officialIdentityPlayers() {
            const map = new Map();
            const add = name => {
                const clean = cleanProfileText(name, 40);
                const norm = normalizeIdentityName(clean);
                if (clean && norm && !map.has(norm)) map.set(norm, clean);
            };
            (demons || []).forEach(level => {
                if (level?.verifier) add(level.verifier);
                Object.values(level?.victors || {}).forEach(v => add(v?.name));
            });
            (challenges || []).forEach(level => {
                if (level?.verifier) add(level.verifier);
                Object.values(level?.victors || {}).forEach(v => add(v?.name));
            });
            return Array.from(map.values()).sort((a,b) => a.localeCompare(b, 'ru'));
        }

        function isOfficialReservedUsername(value) {
            const needle = normalizeIdentityName(value);
            return !!needle && officialIdentityPlayers().some(name => normalizeIdentityName(name) === needle);
        }

        function isValidAccountUsername(value) {
            return /^[A-Za-z0-9_-]{3,24}$/.test(String(value || '').trim());
        }

        function cleanProfileText(value, max) {
            return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
        }

        function updateAccountNav() {
            const user = auth.currentUser;
            const desktop = document.getElementById('accountNavButton');
            const mobile = document.getElementById('mobileAccountButton');
            const label = user ? (currentAccountProfile?.username || 'Профиль') : 'Войти';
            if (desktop) desktop.textContent = label;
            if (mobile) mobile.innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(label)}`;
        }

        function openAccountEntry() {
            if (auth.currentUser) openSection('accountSection');
            else openAccountAuth('login');
        }

        function openAccountAuth(mode = 'login') {
            switchAccountAuth(mode);
            document.getElementById('accountAuthModal').classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(() => document.getElementById('accountAuthEmail')?.focus(), 80);
        }

        function closeAccountAuth() {
            document.getElementById('accountAuthModal').classList.remove('open');
            document.body.style.overflow = '';
            document.getElementById('accountAuthError').textContent = '';
        }

        function switchAccountAuth(mode) {
            const register = mode === 'register';
            document.getElementById('accountLoginTab').classList.toggle('active', !register);
            document.getElementById('accountRegisterTab').classList.toggle('active', register);
            document.getElementById('accountRegisterFields').style.display = register ? 'block' : 'none';
            document.getElementById('accountAuthSubmit').textContent = register ? 'Создать аккаунт' : 'Войти';
            document.getElementById('accountAuthSubmit').dataset.mode = mode;
            document.getElementById('accountAuthError').textContent = '';
        }

        async function submitAccountAuth() {
            const btn = document.getElementById('accountAuthSubmit');
            const mode = btn.dataset.mode || 'login';
            const email = cleanProfileText(document.getElementById('accountAuthEmail').value, 160);
            const password = document.getElementById('accountAuthPassword').value;
            const err = document.getElementById('accountAuthError');
            err.textContent = '';

            if (!email || !password) { err.textContent = 'Введите email и пароль.'; return; }
            if (password.length < 6) { err.textContent = 'Пароль должен содержать минимум 6 символов.'; return; }
            btn.disabled = true;
            const oldLabel = btn.textContent;
            btn.textContent = 'Подождите...';

            try {
                if (mode === 'login') {
                    await auth.signInWithEmailAndPassword(email, password);
                    closeAccountAuth();
                    setTimeout(() => openSection('accountSection'), 50);
                    return;
                }

                const username = cleanProfileText(document.getElementById('accountRegisterUsername').value, 24);
                const displayName = cleanProfileText(document.getElementById('accountRegisterDisplayName').value, 40) || username;
                const gdpsUsername = cleanProfileText(document.getElementById('accountRegisterGdpsName').value, 40);
                const demonListUsername = cleanProfileText(document.getElementById('accountRegisterDemonListName').value, 40);
                if (!isValidAccountUsername(username)) {
                    err.textContent = 'Username: 3–24 символа, только латинские буквы, цифры, _ и -.';
                    return;
                }
                if (isOfficialReservedUsername(username)) {
                    err.textContent = 'Этот username зарезервирован за официальным игроком Demon List. Выберите другой username и после регистрации подтвердите профиль.';
                    return;
                }
                if (!gdpsUsername) { err.textContent = 'Укажите ник на Night GDPS.'; return; }

                const cred = await auth.createUserWithEmailAndPassword(email, password);
                const uid = cred.user.uid;
                const key = accountUsernameKey(username);
                let claimed = false;
                let profileCreated = false;
                try {
                    const reservedSnap = await db.ref('reservedNames/' + key).once('value');
                    if (reservedSnap.exists()) throw new Error('USERNAME_RESERVED');

                    // Create the profile first with its immutable canonical username key.
                    // Firebase Rules only allow claiming /usernames/<key> when this key belongs
                    // to the authenticated profile, preventing one account from reserving many names.
                    const profile = {
                        username,
                        usernameKey: key,
                        displayName,
                        gdpsUsername,
                        demonListUsername,
                        avatar: '',
                        bio: '',
                        role: 'user',
                        identityVerified: false,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    };
                    await db.ref('users/' + uid).set(profile);
                    profileCreated = true;

                    const tx = await db.ref('usernames/' + key).transaction(current => current === null ? uid : undefined);
                    if (!tx.committed) throw new Error('USERNAME_TAKEN');
                    claimed = true;

                    currentAccountProfile = { ...profile, createdAt: Date.now(), updatedAt: Date.now() };
                    closeAccountAuth();
                    openSection('accountSection');
                } catch (inner) {
                    // Roll back in this order: profile first, then the username claim.
                    // Once a username is claimed, Rules deliberately prevent a normal account
                    // from deleting/recreating its profile to accumulate extra username claims.
                    if (profileCreated) await db.ref('users/' + uid).remove().catch(() => {});
                    if (claimed) await db.ref('usernames/' + key).remove().catch(() => {});
                    try { await cred.user.delete(); } catch (_) {}
                    if (inner.message === 'USERNAME_TAKEN') throw new Error('Этот username уже занят.');
                    if (inner.message === 'USERNAME_RESERVED') throw new Error('Этот username зарезервирован за официальным игроком Demon List.');
                    throw inner;
                }
            } catch (e) {
                let message = e.message || 'Не удалось выполнить операцию.';
                if (e.code === 'auth/email-already-in-use') message = 'Этот email уже зарегистрирован.';
                if (e.code === 'auth/invalid-email') message = 'Некорректный email.';
                if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-login-credentials') message = 'Неверный email или пароль.';
                if (e.code === 'PERMISSION_DENIED' || /permission/i.test(message)) message = 'Firebase Security Rules пока не разрешают эту операцию.';
                err.textContent = message;
            } finally {
                btn.disabled = false;
                btn.textContent = oldLabel;
            }
        }

        async function logoutAccount() {
            await auth.signOut();
            openSection('homeSection');
        }

        function stopUserSubmissionListener() {
            if (userSubmissionQuery && userSubmissionHandler) userSubmissionQuery.off('value', userSubmissionHandler);
            userSubmissionQuery = null;
            userSubmissionHandler = null;
        }

        function startUserSubmissionListener(uid) {
            stopUserSubmissionListener();
            userSubmissionQuery = db.ref('recordSubmissions').orderByChild('userUid').equalTo(uid);
            userSubmissionHandler = snap => {
                const value = snap.val() || {};
                currentUserSubmissions = Object.entries(value).map(([key, v]) => ({ key, ...v }))
                    .sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (document.getElementById('accountSection')?.classList.contains('active')) renderAccountSection();
            };
            userSubmissionQuery.on('value', userSubmissionHandler, error => console.warn('Submission listener:', error.message));
        }

        function stopIdentityClaimListener() {
            if (identityClaimQuery && identityClaimHandler) identityClaimQuery.off('value', identityClaimHandler);
            identityClaimQuery = null;
            identityClaimHandler = null;
            currentIdentityClaims = [];
        }

        function startIdentityClaimListener(uid) {
            stopIdentityClaimListener();
            identityClaimQuery = db.ref('profileClaims').orderByChild('userUid').equalTo(uid);
            identityClaimHandler = snap => {
                const val = snap.val() || {};
                currentIdentityClaims = Object.entries(val).map(([key, v]) => ({ key, ...v }))
                    .sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (document.getElementById('accountSection')?.classList.contains('active')) renderAccountSection();
            };
            identityClaimQuery.on('value', identityClaimHandler, e => console.warn('Identity claims:', e.message));
        }

        function latestIdentityClaim() {
            return currentIdentityClaims.find(c => c.status === 'pending') || currentIdentityClaims[0] || null;
        }

        function identityStatusForProfile(profile) {
            if (profile?.identityVerified) return 'verified';
            const claim = latestIdentityClaim();
            if (claim?.status === 'pending') return 'pending';
            if (claim?.status === 'rejected') return 'rejected';
            return 'unverified';
        }

        function statusText(status) {
            return ({ pending:'На рассмотрении', approved:'Принято', rejected:'Отклонено', needs_proof:'Нужны пруфы' })[status] || status || '—';
        }

        function formatAccountDate(ts) {
            if (!ts || typeof ts !== 'number') return '—';
            return new Date(ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        }

        function safeAvatarUrl(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            try {
                const u = new URL(raw);
                return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
            } catch (_) { return ''; }
        }

        function renderAccountSection() {
            const user = auth.currentUser;
            if (!user) { openAccountAuth('login'); openSection('homeSection'); return; }
            const p = currentAccountProfile || buildFallbackAccountProfile(user, null);
            const avatar = safeAvatarUrl(p.avatar);
            const initial = escapeHtml((p.displayName || p.username || 'N').slice(0,1).toUpperCase());
            const avatarHtml = avatar
                ? `<div class="account-avatar" style="background-image:url('${escapeHtml(avatar)}')"></div>`
                : `<div class="account-avatar">${initial}</div>`;
            const shownGdps = p.identityVerified ? (p.verifiedGdpsUsername || p.gdpsUsername || '—') : (p.gdpsUsername || '—');
            const shownDl = p.identityVerified ? (p.verifiedDemonListUsername || p.demonListUsername || '—') : (p.demonListUsername || '—');
            const verifiedMark = p.identityVerified ? '<span class="identity-status verified" style="margin-left:8px;vertical-align:middle;">Подтверждено</span>' : '';
            document.getElementById('accountProfileHeader').innerHTML = `${avatarHtml}<div><div class="account-profile-name">${escapeHtml(p.displayName || p.username || 'Пользователь')}${verifiedMark}</div><div class="account-profile-user">@${escapeHtml(p.username || 'user')}</div><div class="account-profile-meta">Night GDPS: ${escapeHtml(shownGdps)} · Demon List: ${escapeHtml(shownDl)}</div></div>`;

            const total = currentUserSubmissions.length;
            const approved = currentUserSubmissions.filter(x => x.status === 'approved').length;
            const pending = currentUserSubmissions.filter(x => x.status === 'pending' || x.status === 'needs_proof').length;
            document.getElementById('accountStats').innerHTML = `
                <div class="account-stat"><strong>${total}</strong><span>всего заявок</span></div>
                <div class="account-stat"><strong>${approved}</strong><span>принято</span></div>
                <div class="account-stat"><strong>${pending}</strong><span>на проверке</span></div>`;

            document.getElementById('accountDisplayName').value = p.displayName || '';
            document.getElementById('accountGdpsName').value = p.gdpsUsername || '';
            document.getElementById('accountDemonListName').value = p.demonListUsername || '';
            document.getElementById('accountAvatar').value = p.avatar || '';
            document.getElementById('accountBio').value = p.bio || '';

            const identityStatus = identityStatusForProfile(p);
            const badge = document.getElementById('identityStatusBadge');
            const content = document.getElementById('identityStatusContent');
            const claimButton = document.getElementById('identityClaimButton');
            const gdpsInput = document.getElementById('accountGdpsName');
            const dlInput = document.getElementById('accountDemonListName');
            const claim = latestIdentityClaim();
            badge.className = `identity-status ${identityStatus}`;
            badge.textContent = identityStatus === 'verified' ? 'Подтверждено' : identityStatus === 'pending' ? 'На проверке' : identityStatus === 'rejected' ? 'Отклонено' : 'Не подтверждено';

            if (p.identityVerified) {
                content.innerHTML = `
                    <div class="identity-row"><span>Night GDPS accountID</span><strong>${escapeHtml(p.gdpsAccountId || '—')}</strong></div>
                    <div class="identity-row"><span>Night GDPS</span><strong>${escapeHtml(p.verifiedGdpsUsername || p.gdpsUsername || '—')}</strong></div>
                    <div class="identity-row"><span>Demon List</span><strong>${escapeHtml(p.verifiedDemonListUsername || 'Профиль не привязан')}</strong></div>
                    <div class="identity-verified-line">Официальные данные закреплены за Firebase UID и не редактируются через настройки профиля.</div>`;
                claimButton.style.display = 'none';
                gdpsInput.disabled = true; dlInput.disabled = true;
                gdpsInput.classList.add('identity-locked'); dlInput.classList.add('identity-locked');
            } else if (claim?.status === 'pending') {
                content.innerHTML = `
                    <div class="identity-row"><span>accountID</span><strong>${escapeHtml(claim.gdpsAccountId || '—')}</strong></div>
                    <div class="identity-row"><span>Night GDPS</span><strong>${escapeHtml(claim.requestedGdpsUsername || '—')}</strong></div>
                    <div class="identity-row"><span>Demon List</span><strong>${escapeHtml(claim.requestedPlayerName || 'Не выбран')}</strong></div>
                    <div class="identity-verified-line">Заявка ожидает решения модератора.</div>`;
                claimButton.style.display = 'none';
                gdpsInput.disabled = false; dlInput.disabled = false;
                gdpsInput.classList.remove('identity-locked'); dlInput.classList.remove('identity-locked');
            } else {
                const rejected = claim?.status === 'rejected' && claim.moderatorMessage
                    ? `<div class="submission-note">${escapeHtml(claim.moderatorMessage)}</div>` : '';
                content.innerHTML = `<div class="identity-verified-line">Подтвердите Night GDPS accountID через модерацию. Только после подтверждения аккаунт сможет отправлять официальные рекорды.</div>${rejected}`;
                claimButton.style.display = '';
                claimButton.textContent = claim?.status === 'rejected' ? 'Отправить заявку повторно' : 'Подтвердить аккаунт Night GDPS';
                gdpsInput.disabled = false; dlInput.disabled = false;
                gdpsInput.classList.remove('identity-locked'); dlInput.classList.remove('identity-locked');
            }

            const list = document.getElementById('accountSubmissionList');
            if (!currentUserSubmissions.length) {
                list.innerHTML = '<div class="moderation-empty">У вас пока нет заявок.</div>';
                return;
            }
            list.innerHTML = currentUserSubmissions.map(s => {
                const yt = isValidYouTubeUrl(s.youtubeUrl) ? escapeHtml(s.youtubeUrl) : '';
                const moderatorNote = s.moderatorMessage ? `<div class="submission-note">${escapeHtml(s.moderatorMessage)}</div>` : '';
                const listLabel = s.levelType === 'challenges' ? 'Challenge List' : s.levelType === 'impossible' ? 'Impossible List' : 'Demon List';
                return `<div class="submission-item">
                    <div class="submission-top">
                        <div><div class="submission-name">${escapeHtml(s.levelName || 'Без названия')}</div><div class="submission-meta">${s.role === 'verifier' ? 'Verifier' : 'Victor'} · ${escapeHtml(listLabel)} · ${parseInt(s.percentage || 100)}% · ${parseInt(s.attempts || 0).toLocaleString('ru-RU')} попыток · ${formatAccountDate(s.createdAt)}</div></div>
                        <span class="submission-status ${escapeHtml(s.status || 'pending')}">${escapeHtml(statusText(s.status))}</span>
                    </div>
                    ${yt ? `<div class="submission-meta" style="margin-top:8px;"><a href="${yt}" target="_blank" rel="noopener" style="color:#8db7eb;text-decoration:none;">Открыть прохождение на YouTube</a></div>` : ''}
                    ${s.comment ? `<div class="submission-meta" style="margin-top:7px;">${escapeHtml(s.comment)}</div>` : ''}
                    ${moderatorNote}
                </div>`;
            }).join('');
        }

        async function saveAccountProfile() {
            const user = auth.currentUser;
            if (!user || !currentAccountProfile || currentAccountProfile._fallback) {
                document.getElementById('accountSaveMessage').textContent = 'Профиль должен быть создан через регистрацию пользователя.';
                return;
            }
            const update = {
                displayName: cleanProfileText(document.getElementById('accountDisplayName').value, 40),
                avatar: safeAvatarUrl(document.getElementById('accountAvatar').value),
                bio: cleanProfileText(document.getElementById('accountBio').value, 300),
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            if (!currentAccountProfile.identityVerified) {
                update.gdpsUsername = cleanProfileText(document.getElementById('accountGdpsName').value, 40);
                update.demonListUsername = cleanProfileText(document.getElementById('accountDemonListName').value, 40);
            }
            if (!update.displayName || (!currentAccountProfile.identityVerified && !update.gdpsUsername)) {
                document.getElementById('accountSaveMessage').textContent = 'Заполните отображаемый ник и ник Night GDPS.';
                return;
            }
            try {
                await db.ref('users/' + user.uid).update(update);
                currentAccountProfile = { ...currentAccountProfile, ...update, updatedAt: Date.now() };
                document.getElementById('accountSaveMessage').textContent = 'Профиль сохранён.';
                updateAccountNav();
                renderAccountSection();
            } catch (e) {
                document.getElementById('accountSaveMessage').textContent = 'Не удалось сохранить профиль: ' + e.message;
            }
        }

        function openIdentityClaimModal() {
            if (!auth.currentUser || !currentAccountProfile || currentAccountProfile._fallback) return;
            if (currentAccountProfile.identityVerified) { showToast('Night GDPS аккаунт уже подтверждён.'); return; }
            if (currentIdentityClaims.some(c => c.status === 'pending')) { showToast('У вас уже есть заявка на проверке.'); return; }
            document.getElementById('identityClaimAccountId').value = '';
            document.getElementById('identityClaimGdpsName').value = currentAccountProfile.gdpsUsername || '';
            document.getElementById('identityClaimPlayerSearch').value = currentAccountProfile.demonListUsername || '';
            document.getElementById('identityClaimPlayerKey').value = '';
            document.getElementById('identityClaimComment').value = '';
            document.getElementById('identityClaimError').textContent = '';
            document.getElementById('identityClaimPlayerResults').classList.remove('show');
            document.getElementById('identityClaimModal').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeIdentityClaimModal() {
            document.getElementById('identityClaimModal').classList.remove('open');
            document.getElementById('identityClaimPlayerResults').classList.remove('show');
            document.body.style.overflow = '';
        }

        function searchIdentityPlayers() {
            const input = document.getElementById('identityClaimPlayerSearch');
            const results = document.getElementById('identityClaimPlayerResults');
            const hidden = document.getElementById('identityClaimPlayerKey');
            hidden.value = '';
            const q = normalizeIdentityName(input.value);
            const players = officialIdentityPlayers().filter(name => !q || normalizeIdentityName(name).includes(q)).slice(0, 12);
            results.innerHTML = players.length
                ? players.map(name => `<div class="level-search-item" onclick="selectIdentityPlayer('${encodeURIComponent(name)}')"><div class="level-search-name">${escapeHtml(name)}</div><div class="level-search-meta">Официальный профиль Demon List</div></div>`).join('')
                : '<div class="level-search-item"><div class="level-search-meta">Совпадений не найдено. Поле можно оставить без выбора.</div></div>';
            results.classList.add('show');
        }

        function selectIdentityPlayer(encodedName) {
            const name = decodeURIComponent(encodedName);
            document.getElementById('identityClaimPlayerSearch').value = name;
            document.getElementById('identityClaimPlayerKey').value = identityPlayerKey(name);
            document.getElementById('identityClaimPlayerHint').textContent = `Выбран официальный профиль: ${name}`;
            document.getElementById('identityClaimPlayerResults').classList.remove('show');
        }

        async function submitIdentityClaim() {
            const user = auth.currentUser;
            const error = document.getElementById('identityClaimError');
            const button = document.getElementById('identityClaimSubmit');
            error.textContent = '';
            if (!user || !currentAccountProfile || currentAccountProfile._fallback) return;
            if (currentAccountProfile.identityVerified) { error.textContent = 'Аккаунт уже подтверждён.'; return; }
            if (currentIdentityClaims.some(c => c.status === 'pending')) { error.textContent = 'Заявка уже находится на проверке.'; return; }

            const accountId = cleanProfileText(document.getElementById('identityClaimAccountId').value, 20);
            const gdpsName = cleanProfileText(document.getElementById('identityClaimGdpsName').value, 40);
            const playerText = cleanProfileText(document.getElementById('identityClaimPlayerSearch').value, 40);
            let playerKey = document.getElementById('identityClaimPlayerKey').value;
            const comment = cleanProfileText(document.getElementById('identityClaimComment').value, 400);
            if (!/^\d{1,20}$/.test(accountId) || accountId === '0') { error.textContent = 'Укажите корректный числовой Night GDPS accountID.'; return; }
            if (!gdpsName) { error.textContent = 'Укажите ник на Night GDPS.'; return; }

            let playerName = '';
            if (playerText) {
                playerName = officialIdentityPlayers().find(name => normalizeIdentityName(name) === normalizeIdentityName(playerText)) || '';
                if (!playerName) {
                    error.textContent = 'Если вы указываете Demon List профиль, выберите существующего игрока из списка. Если профиля ещё нет, оставьте поле пустым.';
                    return;
                }
                playerKey = identityPlayerKey(playerName);
            }

            button.disabled = true;
            try {
                // Пользователь не получает доступ к карте привязок. Конфликты accountID/профиля
                // проверяются модератором и атомарными Firebase Rules в момент подтверждения.
                const claim = {
                    userUid: user.uid,
                    username: currentAccountProfile.username || '',
                    displayName: currentAccountProfile.displayName || '',
                    gdpsAccountId: accountId,
                    requestedGdpsUsername: gdpsName,
                    requestedPlayerKey: playerKey || '',
                    requestedPlayerName: playerName || '',
                    comment,
                    status: 'pending',
                    moderatorUid: null,
                    moderatorName: null,
                    moderatorMessage: null,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP,
                    reviewedAt: null
                };
                await db.ref('profileClaims').push(claim);
                closeIdentityClaimModal();
                showToast('Заявка на подтверждение отправлена.');
            } catch (e) {
                error.textContent = e.message || 'Не удалось отправить заявку.';
            } finally { button.disabled = false; }
        }

        document.addEventListener('click', event => {
            const input = document.getElementById('identityClaimPlayerSearch');
            const results = document.getElementById('identityClaimPlayerResults');
            if (input && results && !input.contains(event.target) && !results.contains(event.target)) results.classList.remove('show');
        });

        function openRecordSubmissionSection() {
            if (!auth.currentUser) { openAccountAuth('login'); return; }
            if (!currentAccountProfile || currentAccountProfile._fallback) {
                openSection('accountSection');
                showToast('Сначала завершите профиль пользователя.');
                return;
            }
            if (!currentAccountProfile.identityVerified) {
                openSection('accountSection');
                showToast('Для отправки рекордов сначала подтвердите аккаунт Night GDPS.');
                return;
            }
            openSection('recordSubmitSection');
        }

        function prepareRecordSubmissionSection() {
            const user = auth.currentUser;
            if (!user) return;
            const p = currentAccountProfile || buildFallbackAccountProfile(user, null);
            const avatar = safeAvatarUrl(p.avatar);
            const verifiedName = p.identityVerified ? (p.verifiedGdpsUsername || p.gdpsUsername || '') : '';
            document.getElementById('recordAccountSummary').innerHTML = `${avatar ? `<div class="account-avatar" style="background-image:url('${escapeHtml(avatar)}')"></div>` : `<div class="account-avatar">${escapeHtml((p.displayName || p.username || 'N').slice(0,1).toUpperCase())}</div>`}<div><div class="account-profile-name">${escapeHtml(p.displayName || p.username || 'Пользователь')}</div><div class="account-profile-user">@${escapeHtml(p.username || 'user')}</div><div class="account-profile-meta">${p.identityVerified ? `Night GDPS: ${escapeHtml(verifiedName)} · accountID ${escapeHtml(p.gdpsAccountId || '—')}` : 'Night GDPS аккаунт не подтверждён'}</div></div>`;
            validateRecordForm();
        }

        function setRecordRole(role) {
            selectedRecordRole = role === 'verifier' ? 'verifier' : 'victor';
            document.getElementById('recordRoleVictor').classList.toggle('active', selectedRecordRole === 'victor');
            document.getElementById('recordRoleVerifier').classList.toggle('active', selectedRecordRole === 'verifier');
            document.getElementById('recordVictorFields').style.display = selectedRecordRole === 'victor' ? 'block' : 'none';
            document.getElementById('recordVerifierFields').style.display = selectedRecordRole === 'verifier' ? 'block' : 'none';
            document.getElementById('recordLevelResults').classList.remove('show');
            validateRecordForm();
        }

        function searchRecordLevels() {
            const input = document.getElementById('recordLevelSearch');
            const results = document.getElementById('recordLevelResults');
            document.getElementById('recordLevelKey').value = '';
            document.getElementById('recordLevelType').value = 'demons';
            document.getElementById('recordSelectedLevelHint').textContent = 'Выберите уровень из Demon, Challenge или Impossible List.';
            const q = input.value.trim().toLowerCase();
            const pools = [
                ...demons.map(d => ({ ...d, _listType:'demons', _listLabel:'Demon List' })),
                ...challenges.map(d => ({ ...d, _listType:'challenges', _listLabel:'Challenge List' })),
                ...(window.impossibleLevels || []).map(d => ({ ...d, _listType:'impossible', _listLabel:'Impossible List' }))
            ];
            const matches = pools.filter(d => !q || [d.name,d.author,d.levelID,d._listLabel].some(v => String(v||'').toLowerCase().includes(q))).slice(0, 12);
            if (!matches.length) {
                results.innerHTML = '<div class="level-search-item"><div class="level-search-meta">Совпадений не найдено</div></div>';
            } else {
                results.innerHTML = matches.map(d => `<div class="level-search-item" onclick="selectRecordLevel('${escapeHtml(d.key)}','${escapeHtml(d._listType)}')"><div class="level-search-name">${escapeHtml(d.name)}</div><div class="level-search-meta">${escapeHtml(d._listLabel)} · ${escapeHtml(d.author || 'Автор не указан')} · ID ${escapeHtml(d.levelID || '—')}</div></div>`).join('');
            }
            results.classList.add('show');
            validateRecordForm();
        }

        function selectRecordLevel(key, type = 'demons') {
            const list = type === 'challenges' ? challenges : type === 'impossible' ? (window.impossibleLevels || []) : demons;
            const level = list.find(d => String(d.key) === String(key));
            if (!level) return;
            document.getElementById('recordLevelKey').value = level.key;
            document.getElementById('recordLevelType').value = type;
            document.getElementById('recordLevelSearch').value = level.name;
            const label = type === 'challenges' ? 'Challenge List' : type === 'impossible' ? 'Impossible List' : 'Demon List';
            document.getElementById('recordSelectedLevelHint').textContent = `${label} · ID ${level.levelID || '—'} · ${level.author || 'Автор не указан'}`;
            document.getElementById('recordLevelResults').classList.remove('show');
            validateRecordForm();
        }

        document.addEventListener('click', event => {
            const input = document.getElementById('recordLevelSearch');
            const results = document.getElementById('recordLevelResults');
            if (input && results && !input.contains(event.target) && !results.contains(event.target)) results.classList.remove('show');
        });

        function extractYouTubeId(value) {
            try {
                const u = new URL(String(value || '').trim());
                const host = u.hostname.toLowerCase().replace(/^www\./, '');
                if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || '';
                if (host === 'youtube.com' || host === 'm.youtube.com') {
                    if (u.pathname === '/watch') return u.searchParams.get('v') || '';
                    const parts = u.pathname.split('/').filter(Boolean);
                    if (['shorts','embed','live'].includes(parts[0])) return parts[1] || '';
                }
            } catch (_) {}
            return '';
        }

        function isValidYouTubeUrl(value) {
            return /^[A-Za-z0-9_-]{6,20}$/.test(extractYouTubeId(value));
        }

        function validateRecordForm() {
            const error = document.getElementById('recordFormError');
            const button = document.getElementById('recordSubmitButton');
            if (!error || !button) return false;
            let message = '';
            if (!auth.currentUser) message = 'Требуется авторизация.';
            else if (!currentAccountProfile || currentAccountProfile._fallback) message = 'Сначала завершите профиль пользователя.';
            else if (!currentAccountProfile.identityVerified) message = 'Для отправки рекорда требуется подтверждённый Night GDPS аккаунт.';
            else if (selectedRecordRole === 'victor' && !document.getElementById('recordLevelKey').value) message = 'Выберите уровень из списка.';
            else if (selectedRecordRole === 'verifier' && !cleanProfileText(document.getElementById('recordVerifierLevelName').value, 80)) message = 'Для Verifier обязательно название уровня.';
            const attempts = Number(document.getElementById('recordAttempts')?.value || 0);
            const percentage = Number(document.getElementById('recordPercentage')?.value || 0);
            if (!message && (!Number.isInteger(attempts) || attempts < 1)) message = 'Количество попыток должно быть положительным целым числом.';
            if (!message && (!Number.isInteger(percentage) || percentage < 1 || percentage > 100)) message = 'Процент должен быть целым числом от 1 до 100.';
            if (!message && !isValidYouTubeUrl(document.getElementById('recordYoutube')?.value)) message = 'Укажите корректную ссылку YouTube.';
            error.textContent = message;
            button.disabled = !!message;
            return !message;
        }

        async function submitRecordApplication() {
            if (!validateRecordForm()) return;
            const user = auth.currentUser;
            const p = currentAccountProfile;
            const attempts = Number(document.getElementById('recordAttempts').value);
            const percentage = Number(document.getElementById('recordPercentage').value);
            const youtubeUrl = document.getElementById('recordYoutube').value.trim();
            const comment = cleanProfileText(document.getElementById('recordComment').value, 600);
            let levelKey = null, levelName = '', levelId = '', levelType = 'demons';
            if (selectedRecordRole === 'victor') {
                levelKey = document.getElementById('recordLevelKey').value;
                levelType = document.getElementById('recordLevelType').value || 'demons';
                const list = levelType === 'challenges' ? challenges : levelType === 'impossible' ? (window.impossibleLevels || []) : demons;
                const level = list.find(d => String(d.key) === String(levelKey));
                if (!level) { document.getElementById('recordFormError').textContent = 'Выбранный уровень больше не найден в списке.'; return; }
                levelName = level.name || '';
                levelId = String(level.levelID || '');
            } else {
                levelName = cleanProfileText(document.getElementById('recordVerifierLevelName').value, 80);
                levelId = cleanProfileText(document.getElementById('recordVerifierLevelId').value, 24);
            }

            const payload = {
                userUid: user.uid,
                username: p.username || '',
                displayName: p.displayName || p.username || '',
                gdpsUsername: p.verifiedGdpsUsername || p.gdpsUsername || '',
                demonListUsername: p.verifiedDemonListUsername || p.demonListUsername || '',
                gdpsAccountId: p.gdpsAccountId || '',
                role: selectedRecordRole,
                levelType,
                levelKey,
                levelName,
                levelId,
                attempts,
                percentage,
                youtubeUrl,
                comment,
                status: 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                reviewedAt: null,
                reviewingBy: null,
                reviewingByName: null,
                moderatorUid: null,
                moderatorName: null,
                moderatorMessage: null,
                officialRecordCreated: false
            };
            const btn = document.getElementById('recordSubmitButton');
            btn.disabled = true;
            btn.textContent = 'Отправка...';
            document.getElementById('recordFormSuccess').textContent = '';
            try {
                await db.ref('recordSubmissions').push(payload);
                document.getElementById('recordFormSuccess').textContent = 'Заявка отправлена модераторам.';
                document.getElementById('recordAttempts').value = '';
                document.getElementById('recordYoutube').value = '';
                document.getElementById('recordComment').value = '';
                document.getElementById('recordPercentage').value = '100';
                document.getElementById('recordLevelSearch').value = '';
                document.getElementById('recordLevelKey').value = '';
                document.getElementById('recordLevelType').value = 'demons';
                document.getElementById('recordVerifierLevelName').value = '';
                document.getElementById('recordVerifierLevelId').value = '';
            } catch (e) {
                document.getElementById('recordFormError').textContent = 'Не удалось отправить заявку: ' + e.message;
            } finally {
                btn.textContent = 'Отправить на проверку';
                validateRecordForm();
            }
        }

        function canReviewIdentityClaims() {
            return !!(isModerator && (isAdmin || currentUserPermissions.canAddRecords));
        }

        function stopIdentityCounter() {
            if (identityCounterRef && identityCounterHandler) identityCounterRef.off('value', identityCounterHandler);
            identityCounterRef = null; identityCounterHandler = null;
            const el = document.getElementById('modIdentityPendingCount'); if (el) el.textContent = '0';
        }

        function startIdentityCounter() {
            stopIdentityCounter();
            if (!canReviewIdentityClaims()) return;
            identityCounterRef = db.ref('profileClaims');
            identityCounterHandler = snap => {
                const val = snap.val() || {};
                const count = Object.values(val).filter(c => c && c.status === 'pending').length;
                const el = document.getElementById('modIdentityPendingCount'); if (el) el.textContent = String(count);
            };
            identityCounterRef.on('value', identityCounterHandler, e => console.warn('Identity counter:', e.message));
        }

        function openIdentityModerationPanel() {
            if (!canReviewIdentityClaims()) return;
            document.getElementById('identityModerationPanel').classList.add('open');
            document.body.style.overflow = 'hidden';
            if (!identityModerationRef) {
                identityModerationRef = db.ref('profileClaims');
                identityModerationHandler = snap => {
                    const val = snap.val() || {};
                    identityModerationClaims = Object.entries(val).map(([key,v]) => ({key,...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
                    renderIdentityModerationList();
                };
                identityModerationRef.on('value', identityModerationHandler, e => showToast('Не удалось загрузить заявки: ' + e.message));
            }
            switchIdentityModerationTab('pending');
        }

        function closeIdentityModerationPanel() {
            document.getElementById('identityModerationPanel').classList.remove('open');
            document.body.style.overflow = '';
        }

        function switchIdentityModerationTab(tab) {
            currentIdentityModerationTab = ['pending','approved','rejected'].includes(tab) ? tab : 'pending';
            document.querySelectorAll('[data-identity-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.identityTab === currentIdentityModerationTab));
            renderIdentityModerationList();
        }

        function renderIdentityModerationList() {
            const root = document.getElementById('identityModerationList');
            if (!root) return;
            const items = identityModerationClaims.filter(c => c.status === currentIdentityModerationTab);
            if (!items.length) { root.innerHTML = '<div class="moderation-empty">Заявок в этом разделе нет.</div>'; return; }
            root.innerHTML = items.map(c => `
                <div class="moderation-card">
                    <div class="moderation-card-top">
                        <div><div class="moderation-level-name">${escapeHtml(c.requestedGdpsUsername || 'Без ника')}</div><div class="moderation-submeta">@${escapeHtml(c.username || 'user')} · ${formatAccountDate(c.createdAt)}</div></div>
                        <span class="submission-status ${escapeHtml(c.status)}">${escapeHtml(c.status === 'pending' ? 'На рассмотрении' : c.status === 'approved' ? 'Подтверждено' : 'Отклонено')}</span>
                    </div>
                    <div class="moderation-info-grid">
                        <div class="moderation-info"><span>Night GDPS accountID</span><strong>${escapeHtml(c.gdpsAccountId || '—')}</strong></div>
                        <div class="moderation-info"><span>Night GDPS</span><strong>${escapeHtml(c.requestedGdpsUsername || '—')}</strong></div>
                        <div class="moderation-info"><span>Demon List</span><strong>${escapeHtml(c.requestedPlayerName || 'Не привязывается')}</strong></div>
                        <div class="moderation-info"><span>Firebase UID</span><strong>${escapeHtml(c.userUid || '—')}</strong></div>
                    </div>
                    ${c.comment ? `<div class="moderation-identity-target">Комментарий: ${escapeHtml(c.comment)}</div>` : ''}
                    ${c.moderatorMessage ? `<div class="submission-note">${escapeHtml(c.moderatorMessage)}</div>` : ''}
                    ${c.status === 'pending' ? `<div class="moderation-actions"><button class="mod-action approve" onclick="openIdentityDecision('${c.key}','approve')">Подтвердить</button><button class="mod-action reject" onclick="openIdentityDecision('${c.key}','reject')">Отклонить</button></div>` : ''}
                </div>`).join('');
        }

        function openIdentityDecision(id, action) {
            if (!canReviewIdentityClaims()) return;
            const c = identityModerationClaims.find(x => x.key === id);
            if (!c || c.status !== 'pending') return;
            pendingIdentityDecision = { id, action };
            document.getElementById('identityDecisionError').textContent = '';
            document.getElementById('identityDecisionReason').value = '';
            const reject = action === 'reject';
            document.getElementById('identityDecisionTitle').textContent = reject ? 'Отклонить привязку' : 'Подтвердить игрока';
            document.getElementById('identityDecisionText').textContent = reject
                ? `Укажите причину отказа для ${c.requestedGdpsUsername || 'пользователя'}.`
                : `Связать accountID ${c.gdpsAccountId} с аккаунтом @${c.username || 'user'}${c.requestedPlayerName ? ` и профилем ${c.requestedPlayerName}` : ''}?`;
            document.getElementById('identityDecisionReasonWrap').style.display = reject ? 'block' : 'none';
            document.getElementById('identityDecisionConfirm').textContent = reject ? 'Отклонить' : 'Подтвердить';
            document.getElementById('identityDecisionModal').classList.add('open');
        }

        function closeIdentityDecisionModal() {
            document.getElementById('identityDecisionModal').classList.remove('open');
            pendingIdentityDecision = { id:null, action:null };
        }

        async function confirmIdentityDecision() {
            const { id, action } = pendingIdentityDecision;
            if (!id || !action || !canReviewIdentityClaims()) return;
            const reason = cleanProfileText(document.getElementById('identityDecisionReason').value, 400);
            if (action === 'reject' && !reason) { document.getElementById('identityDecisionError').textContent = 'Причина обязательна.'; return; }
            const btn = document.getElementById('identityDecisionConfirm'); btn.disabled = true;
            try {
                await moderateIdentityClaim(id, action, reason);
                closeIdentityDecisionModal();
            } catch (e) { document.getElementById('identityDecisionError').textContent = e.message || 'Не удалось обработать заявку.'; }
            finally { btn.disabled = false; }
        }

        async function moderateIdentityClaim(id, action, reason) {
            const claimRef = db.ref('profileClaims/' + id);
            const claimTx = await claimRef.transaction(c => {
                if (!c || c.status !== 'pending') return;
                c.reviewLock = auth.currentUser.uid;
                return c;
            });
            if (!claimTx.committed) throw new Error('Эта заявка уже обработана.');
            const c = claimTx.snapshot.val();
            const modUid = auth.currentUser.uid;
            const modName = moderatorDisplayName();
            const now = firebase.database.ServerValue.TIMESTAMP;

            if (action === 'reject') {
                const updates = {};
                updates[`profileClaims/${id}/status`] = 'rejected';
                updates[`profileClaims/${id}/moderatorUid`] = modUid;
                updates[`profileClaims/${id}/moderatorName`] = modName;
                updates[`profileClaims/${id}/moderatorMessage`] = reason;
                updates[`profileClaims/${id}/reviewedAt`] = now;
                updates[`profileClaims/${id}/updatedAt`] = now;
                updates[`profileClaims/${id}/reviewLock`] = null;
                const log = db.ref('auditLogs').push().key;
                updates[`auditLogs/${log}`] = { moderatorUid:modUid, moderatorName:modName, action:'identity_rejected', submissionId:id, targetUid:c.userUid||'', createdAt:now, details:{ gdpsAccountId:c.gdpsAccountId||'', playerName:c.requestedPlayerName||'' } };
                await db.ref().update(updates);
                return;
            }

            // Сначала читаем только модератором, чтобы показать понятную ошибку.
            // Финальное закрепление accountID, официального профиля, user identity и статуса claim
            // выполняется одним root update: либо применится всё, либо ничего.
            const accountSnap = await db.ref('gdpsAccountLinks/' + c.gdpsAccountId).once('value');
            if (accountSnap.exists() && accountSnap.val() !== c.userUid) {
                await claimRef.child('reviewLock').remove().catch(()=>{});
                throw new Error('Этот Night GDPS accountID уже принадлежит другому аккаунту сайта.');
            }
            if (c.requestedPlayerKey) {
                const playerSnap = await db.ref('officialPlayerLinks/' + c.requestedPlayerKey).once('value');
                if (playerSnap.exists() && playerSnap.child('linkedUid').val() !== c.userUid) {
                    await claimRef.child('reviewLock').remove().catch(()=>{});
                    throw new Error('Этот официальный профиль Demon List уже привязан к другому аккаунту.');
                }
            }

            const updates = {};
            updates[`gdpsAccountLinks/${c.gdpsAccountId}`] = c.userUid;
            if (c.requestedPlayerKey) {
                updates[`officialPlayerLinks/${c.requestedPlayerKey}`] = { linkedUid:c.userUid, playerName:c.requestedPlayerName, gdpsAccountId:c.gdpsAccountId, verifiedAt:Date.now() };
            }
            updates[`users/${c.userUid}/identityVerified`] = true;
            updates[`users/${c.userUid}/gdpsAccountId`] = c.gdpsAccountId;
            updates[`users/${c.userUid}/verifiedGdpsUsername`] = c.requestedGdpsUsername;
            updates[`users/${c.userUid}/verifiedDemonListUsername`] = c.requestedPlayerName || '';
            updates[`users/${c.userUid}/gdpsUsername`] = c.requestedGdpsUsername;
            updates[`users/${c.userUid}/demonListUsername`] = c.requestedPlayerName || '';
            updates[`users/${c.userUid}/identityVerifiedAt`] = now;
            updates[`users/${c.userUid}/identityVerifiedBy`] = modUid;
            updates[`users/${c.userUid}/updatedAt`] = now;
            updates[`profileClaims/${id}/status`] = 'approved';
            updates[`profileClaims/${id}/moderatorUid`] = modUid;
            updates[`profileClaims/${id}/moderatorName`] = modName;
            updates[`profileClaims/${id}/moderatorMessage`] = null;
            updates[`profileClaims/${id}/reviewedAt`] = now;
            updates[`profileClaims/${id}/updatedAt`] = now;
            updates[`profileClaims/${id}/reviewLock`] = null;
            const log = db.ref('auditLogs').push().key;
            updates[`auditLogs/${log}`] = { moderatorUid:modUid, moderatorName:modName, action:'identity_approved', submissionId:id, targetUid:c.userUid||'', createdAt:now, details:{ gdpsAccountId:c.gdpsAccountId||'', playerName:c.requestedPlayerName||'' } };
            try { await db.ref().update(updates); }
            catch (e) { await claimRef.child('reviewLock').remove().catch(()=>{}); throw e; }
        }

        async function syncReservedNamesFromOfficialList() {
            if (!isAdmin || !auth.currentUser) return;
            const updates = {};
            officialIdentityPlayers().forEach(name => { updates[accountUsernameKey(name)] = name; });
            (moderators || []).forEach(m => { if (m?.nick) updates[accountUsernameKey(m.nick)] = m.nick; });
            if (Object.keys(updates).length) await db.ref('reservedNames').update(updates).catch(e => console.warn('Reserved names sync:', e.message));
        }

        function canReviewRecordSubmissions() {
            return !!(isModerator && (isAdmin || currentUserPermissions.canAddRecords));
        }

        function moderatorDisplayName() {
            const user = auth.currentUser;
            const found = user ? moderators.find(m => m.uid === user.uid) : null;
            return (found && (found.nick || found.email)) || user?.email || 'Moderator';
        }

        function stopModeratorSubmissionCounter() {
            if (moderatorCounterRef && moderatorCounterHandler) moderatorCounterRef.off('value', moderatorCounterHandler);
            moderatorCounterRef = null; moderatorCounterHandler = null;
            const count = document.getElementById('modRecordPendingCount');
            if (count) count.textContent = '0';
        }

        function startModeratorSubmissionCounter() {
            stopModeratorSubmissionCounter();
            if (!canReviewRecordSubmissions()) return;
            moderatorCounterRef = db.ref('recordSubmissions');
            moderatorCounterHandler = snap => {
                const val = snap.val() || {};
                const countValue = Object.values(val).filter(s => s && s.status === 'pending').length;
                const el = document.getElementById('modRecordPendingCount');
                if (el) el.textContent = String(countValue);
            };
            moderatorCounterRef.on('value', moderatorCounterHandler, e => console.warn('Moderator counter:', e.message));
        }

        function openRecordModerationPanel() {
            if (!canReviewRecordSubmissions()) { showToast('Нет права на проверку рекордов.'); return; }
            document.getElementById('modQuickPanel').style.display = 'none';
            document.getElementById('recordModerationPanel').classList.add('open');
            document.body.style.overflow = 'hidden';
            if (!moderationRef) {
                moderationRef = db.ref('recordSubmissions');
                moderationHandler = snap => {
                    const val = snap.val() || {};
                    moderationSubmissions = Object.entries(val).map(([key,v]) => ({ key, ...v })).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
                    renderRecordModerationList();
                };
                moderationRef.on('value', moderationHandler, e => {
                    document.getElementById('recordModerationList').innerHTML = `<div class="moderation-empty">Не удалось загрузить заявки: ${escapeHtml(e.message)}</div>`;
                });
            }
            renderRecordModerationList();
        }

        function closeRecordModerationPanel() {
            document.getElementById('recordModerationPanel').classList.remove('open');
            document.body.style.overflow = '';
            if (moderationRef && moderationHandler) moderationRef.off('value', moderationHandler);
            moderationRef = null; moderationHandler = null; moderationSubmissions = [];
        }

        function switchRecordModerationTab(status) {
            currentModerationTab = status;
            document.querySelectorAll('[data-record-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.recordTab === status));
            renderRecordModerationList();
        }

        function renderRecordModerationList() {
            const container = document.getElementById('recordModerationList');
            if (!container) return;
            const filtered = moderationSubmissions.filter(s => s.status === currentModerationTab);
            if (!filtered.length) { container.innerHTML = '<div class="moderation-empty">В этой категории заявок нет.</div>'; return; }
            const me = auth.currentUser?.uid || '';
            container.innerHTML = filtered.map(s => {
                const levelType = ['demons','challenges','impossible'].includes(s.levelType) ? s.levelType : 'demons';
                const levelList = levelType === 'challenges' ? challenges : levelType === 'impossible' ? (window.impossibleLevels || []) : demons;
                const level = s.levelKey ? levelList.find(d => String(d.key) === String(s.levelKey)) : null;
                const position = level ? levelList.findIndex(d => d.key === level.key) + 1 : 0;
                const lockedByOther = !!(s.reviewingBy && s.reviewingBy !== me);
                const canAct = ['pending','needs_proof'].includes(s.status) && !lockedByOther;
                const yt = isValidYouTubeUrl(s.youtubeUrl) ? escapeHtml(s.youtubeUrl) : '';
                const reviewLine = s.reviewingBy ? `<div class="submission-note">Проверяет: ${escapeHtml(s.reviewingByName || s.reviewingBy)}</div>` : '';
                return `<div class="moderation-card">
                    <div class="moderation-card-head">
                        <div><div class="moderation-card-title">${escapeHtml(s.levelName || 'Без названия')}</div><div class="moderation-card-sub">${s.role === 'verifier' ? 'Verifier' : 'Victor'} · ${formatAccountDate(s.createdAt)} · ${escapeHtml(s.username || s.userUid || '')}</div></div>
                        <span class="submission-status ${escapeHtml(s.status || 'pending')}">${escapeHtml(statusText(s.status))}</span>
                    </div>
                    <div class="moderation-info-grid">
                        <div class="moderation-info"><span>Night GDPS</span><strong>${escapeHtml(s.gdpsUsername || '—')}</strong></div>
                        <div class="moderation-info"><span>Demon List</span><strong>${escapeHtml(s.demonListUsername || '—')}</strong></div>
                        <div class="moderation-info"><span>UID</span><strong title="${escapeHtml(s.userUid || '')}">${escapeHtml(s.userUid || '—')}</strong></div>
                        <div class="moderation-info"><span>Список</span><strong>${escapeHtml(levelType === 'challenges' ? 'Challenge List' : levelType === 'impossible' ? 'Impossible List' : 'Demon List')}</strong></div>
                        <div class="moderation-info"><span>Level ID</span><strong>${escapeHtml(s.levelId || '—')}</strong></div>
                        <div class="moderation-info"><span>Позиция</span><strong>${position ? '#' + position : '—'}</strong></div>
                        <div class="moderation-info"><span>Результат</span><strong>${parseInt(s.percentage || 100)}% · ${parseInt(s.attempts || 0).toLocaleString('ru-RU')} попыток</strong></div>
                    </div>
                    ${s.comment ? `<div class="moderation-comment">${escapeHtml(s.comment)}</div>` : ''}
                    ${s.moderatorMessage ? `<div class="submission-note">Последнее сообщение модератора: ${escapeHtml(s.moderatorMessage)}</div>` : ''}
                    ${reviewLine}
                    <div class="moderation-actions">
                        ${yt ? `<a class="mod-action" href="${yt}" target="_blank" rel="noopener" style="text-decoration:none;">Открыть YouTube</a>` : ''}
                        ${canAct && !s.reviewingBy ? `<button class="mod-action" onclick="takeRecordSubmission('${s.key}')">Взять на проверку</button>` : ''}
                        ${canAct ? `<button class="mod-action accept" onclick="openRecordDecision('${s.key}','approve')">Принять</button><button class="mod-action reject" onclick="openRecordDecision('${s.key}','reject')">Отклонить</button><button class="mod-action proof" onclick="openRecordDecision('${s.key}','proof')">Запросить пруфы</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        async function takeRecordSubmission(id) {
            if (!canReviewRecordSubmissions()) return;
            const uid = auth.currentUser.uid;
            const name = moderatorDisplayName();
            const ref = db.ref('recordSubmissions/' + id);
            try {
                const tx = await ref.transaction(s => {
                    if (!s || !['pending','needs_proof'].includes(s.status)) return;
                    if (s.reviewingBy && s.reviewingBy !== uid) return;
                    s.reviewingBy = uid; s.reviewingByName = name; s.updatedAt = Date.now();
                    return s;
                });
                if (!tx.committed) showToast('Заявка уже взята или обработана другим модератором.');
            } catch (e) { showToast('Ошибка: ' + e.message); }
        }

        function openRecordDecision(id, action) {
            const s = moderationSubmissions.find(x => x.key === id);
            if (!s || !canReviewRecordSubmissions()) return;
            pendingRecordDecision = { id, action };
            const title = document.getElementById('recordDecisionTitle');
            const textEl = document.getElementById('recordDecisionText');
            const wrap = document.getElementById('recordDecisionReasonWrap');
            const label = document.getElementById('recordDecisionReasonLabel');
            const reason = document.getElementById('recordDecisionReason');
            const confirm = document.getElementById('recordDecisionConfirm');
            reason.value = '';
            document.getElementById('recordDecisionError').textContent = '';
            if (action === 'approve') {
                title.textContent = 'Принять рекорд';
                textEl.textContent = `Подтвердить заявку «${s.levelName || 'Без названия'}»?`;
                wrap.style.display = 'none';
                confirm.textContent = 'Принять';
            } else if (action === 'reject') {
                title.textContent = 'Отклонить рекорд';
                textEl.textContent = 'Укажите причину отказа. Она будет показана пользователю.';
                wrap.style.display = 'block'; label.textContent = 'Причина отказа'; confirm.textContent = 'Отклонить';
            } else {
                title.textContent = 'Запросить дополнительные пруфы';
                textEl.textContent = 'Опишите, какие дополнительные доказательства должен предоставить пользователь.';
                wrap.style.display = 'block'; label.textContent = 'Что нужно предоставить'; confirm.textContent = 'Отправить запрос';
            }
            document.getElementById('recordDecisionModal').classList.add('open');
        }

        function closeRecordDecisionModal() {
            document.getElementById('recordDecisionModal').classList.remove('open');
            pendingRecordDecision = { id:null, action:null };
        }

        async function confirmRecordDecision() {
            const { id, action } = pendingRecordDecision;
            if (!id || !action || !canReviewRecordSubmissions()) return;
            const reason = cleanProfileText(document.getElementById('recordDecisionReason').value, 600);
            if ((action === 'reject' || action === 'proof') && !reason) {
                document.getElementById('recordDecisionError').textContent = 'Сообщение обязательно.'; return;
            }
            const button = document.getElementById('recordDecisionConfirm');
            button.disabled = true;
            try {
                await moderateRecordSubmission(id, action, reason);
                closeRecordDecisionModal();
            } catch (e) {
                document.getElementById('recordDecisionError').textContent = e.message || 'Не удалось обработать заявку.';
            } finally { button.disabled = false; }
        }

        async function moderateRecordSubmission(id, action, reason) {
            const uid = auth.currentUser.uid;
            const modName = moderatorDisplayName();
            const ref = db.ref('recordSubmissions/' + id);
            const lockTx = await ref.transaction(s => {
                if (!s || !['pending','needs_proof'].includes(s.status)) return;
                if (s.reviewingBy && s.reviewingBy !== uid) return;
                if (s.reviewLock && s.reviewLock.uid && s.reviewLock.uid !== uid) return;
                s.reviewLock = { uid, at: Date.now() };
                if (!s.reviewingBy) { s.reviewingBy = uid; s.reviewingByName = modName; }
                return s;
            });
            if (!lockTx.committed) throw new Error('Эта заявка уже была обработана другим модератором.');
            const s = lockTx.snapshot.val();
            const now = firebase.database.ServerValue.TIMESTAMP;
            const updates = {};
            const base = `recordSubmissions/${id}`;
            let newStatus = 'pending';
            let auditAction = '';
            if (action === 'approve') { newStatus = 'approved'; auditAction = 'record_approved'; }
            if (action === 'reject') { newStatus = 'rejected'; auditAction = 'record_rejected'; }
            if (action === 'proof') { newStatus = 'needs_proof'; auditAction = 'record_proof_requested'; }

            updates[`${base}/status`] = newStatus;
            updates[`${base}/moderatorUid`] = uid;
            updates[`${base}/moderatorName`] = modName;
            updates[`${base}/moderatorMessage`] = reason || null;
            updates[`${base}/reviewedAt`] = action === 'proof' ? null : now;
            updates[`${base}/updatedAt`] = now;
            updates[`${base}/reviewLock`] = null;
            if (action !== 'proof') {
                updates[`${base}/reviewingBy`] = null;
                updates[`${base}/reviewingByName`] = null;
            }

            if (action === 'approve' && s.role === 'victor') {
                const levelType = ['demons','challenges','impossible'].includes(s.levelType) ? s.levelType : 'demons';
                const levelList = levelType === 'challenges' ? challenges : levelType === 'impossible' ? (window.impossibleLevels || []) : demons;
                const level = levelList.find(d => String(d.key) === String(s.levelKey));
                if (!level) {
                    await ref.child('reviewLock').remove().catch(() => {});
                    throw new Error('Уровень больше не существует в выбранном списке.');
                }
                const recordKey = db.ref(`${levelType}/${s.levelKey}/victors`).push().key;
                const playerName = cleanProfileText(s.demonListUsername || s.gdpsUsername || s.displayName || s.username, 40);
                updates[`${levelType}/${s.levelKey}/victors/${recordKey}`] = {
                    name: playerName,
                    perc: `${parseInt(s.percentage || 100)}%`,
                    att: String(parseInt(s.attempts || 0)),
                    vid: extractYouTubeId(s.youtubeUrl),
                    submissionId: id,
                    source: 'site'
                };
                updates[`${base}/officialRecordCreated`] = true;
                updates[`${base}/officialRecordKey`] = recordKey;
            } else if (action === 'approve') {
                updates[`${base}/officialRecordCreated`] = false;
                updates[`${base}/approvalKind`] = 'verification';
            }

            const auditKey = db.ref('auditLogs').push().key;
            updates[`auditLogs/${auditKey}`] = {
                moderatorUid: uid,
                moderatorName: modName,
                action: auditAction,
                submissionId: id,
                targetUid: s.userUid || '',
                createdAt: now,
                details: { role: s.role || '', levelType: s.levelType || 'demons', levelName: s.levelName || '', levelKey: s.levelKey || '' }
            };

            try {
                await db.ref().update(updates);
            } catch (e) {
                await ref.child('reviewLock').remove().catch(() => {});
                throw e;
            }
        }



        window.NightAccounts = {
            handleAuthState: async function(user) {
                stopUserSubmissionListener();
                stopModeratorSubmissionCounter();
                stopIdentityClaimListener();
                stopIdentityCounter();
                currentAccountProfile = null;
                currentUserSubmissions = [];

                if (user) {
                    try {
                        const [profileSnap, modSnap] = await Promise.all([
                            db.ref('users/' + user.uid).once('value'),
                            db.ref('moderators/' + user.uid).once('value')
                        ]);
                        currentAccountProfile = profileSnap.val() || buildFallbackAccountProfile(user, modSnap.val());
                        startUserSubmissionListener(user.uid);
                        startIdentityClaimListener(user.uid);
                        if (canReviewRecordSubmissions()) startModeratorSubmissionCounter();
                        if (canReviewIdentityClaims()) startIdentityCounter();
                        if (isAdmin) setTimeout(syncReservedNamesFromOfficialList, 500);
                    } catch (e) {
                        console.error('Account profile load failed:', e);
                        currentAccountProfile = buildFallbackAccountProfile(user, null);
                    }
                }
                updateAccountNav();
                syncModeratorUI();
                if (document.getElementById('accountSection')?.classList.contains('active')) renderAccountSection();
                if (document.getElementById('recordSubmitSection')?.classList.contains('active')) prepareRecordSubmissionSection();
            },
            syncModeratorUI,
            renderAccountSection,
            prepareRecordSubmissionSection
        };

        function syncModeratorUI() {
            const btn = document.getElementById('modRecordQueueBtn');
            if (btn) btn.style.display = canReviewRecordSubmissions() ? 'flex' : 'none';
            const identityBtn = document.getElementById('modIdentityQueueBtn');
            if (identityBtn) identityBtn.style.display = canReviewIdentityClaims() ? 'flex' : 'none';
            if (canReviewRecordSubmissions() && auth.currentUser && !moderatorCounterRef) startModeratorSubmissionCounter();
            if (!canReviewRecordSubmissions()) stopModeratorSubmissionCounter();
            if (canReviewIdentityClaims() && auth.currentUser && !identityCounterRef) startIdentityCounter();
            if (!canReviewIdentityClaims()) stopIdentityCounter();
        }

        if (auth.currentUser) window.NightAccounts.handleAuthState(auth.currentUser);
        else { updateAccountNav(); syncModeratorUI(); }

