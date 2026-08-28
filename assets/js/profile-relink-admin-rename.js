(() => {
    'use strict';

    const RELINK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    const RELINK_SLOT_WINDOW_MS = 15 * 60 * 1000;
    let relinkMode = false;
    let relinkUiBusy = false;
    let uiRefreshTimer = null;

    function setText(el, value) {
        if (el && el.textContent !== value) el.textContent = value;
    }

    const originalSubmitIdentityClaim = submitIdentityClaim;
    const originalCloseIdentityClaimModal = closeIdentityClaimModal;
    const originalModerateIdentityClaim = moderateIdentityClaim;
    const originalRenderIdentityModerationList = renderIdentityModerationList;

    function cleanName(value) {
        return cleanProfileText(value, 40);
    }

    function sameName(a, b) {
        return normalizeIdentityName(a) === normalizeIdentityName(b);
    }

    function formatRemaining(ms) {
        const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        if (days > 0) return `${days} д. ${hours} ч.`;
        if (hours > 0) return `${hours} ч. ${minutes} мин.`;
        return `${minutes} мин.`;
    }

    async function readRelinkSlot(uid) {
        if (!uid) return null;
        try {
            const snap = await db.ref(`identityRelinkSlots/${uid}`).once('value');
            return snap.val() || null;
        } catch (error) {
            console.warn('[Night GDPS] relink slot read:', error?.message || error);
            return null;
        }
    }

    function pendingRelinkClaim() {
        try {
            return currentIdentityClaims.find(c => c && c.status === 'pending' && c.claimType === 'relink') || null;
        } catch (_) {
            return null;
        }
    }

    async function ensureRelinkButton() {
        if (relinkUiBusy) return;
        const user = auth.currentUser;
        const content = document.getElementById('identityStatusContent');
        if (!user || !content) return;

        let profile = null;
        try { profile = currentAccountProfile || null; } catch (_) {}
        if (!profile?.identityVerified) {
            document.getElementById('identityRelinkButton')?.remove();
            document.getElementById('identityRelinkHint')?.remove();
            return;
        }

        let button = document.getElementById('identityRelinkButton');
        let hint = document.getElementById('identityRelinkHint');
        if (!button) {
            button = document.createElement('button');
            button.id = 'identityRelinkButton';
            button.type = 'button';
            button.className = 'account-secondary';
            button.style.marginTop = '12px';
            button.style.width = '100%';
            button.textContent = 'Перепривязать профиль';
            button.addEventListener('click', openIdentityRelinkModal);
            content.insertAdjacentElement('afterend', button);

            hint = document.createElement('div');
            hint.id = 'identityRelinkHint';
            hint.className = 'account-hint';
            hint.style.marginTop = '7px';
            button.insertAdjacentElement('afterend', hint);
        }

        relinkUiBusy = true;
        try {
            const pending = pendingRelinkClaim();
            if (pending) {
                button.disabled = true;
                setText(button, 'Перепривязка на проверке');
                setText(hint, 'Новая привязка вступит в силу только после одобрения модератором.');
                return;
            }

            const slot = await readRelinkSlot(user.uid);
            const lastAt = Number(slot?.at || 0);
            const remaining = lastAt ? RELINK_COOLDOWN_MS - (Date.now() - lastAt) : 0;
            if (remaining > 0) {
                button.disabled = true;
                setText(button, 'Перепривязать профиль');
                setText(hint, `Повторная перепривязка будет доступна через ${formatRemaining(remaining)}.`);
            } else {
                button.disabled = false;
                setText(button, 'Перепривязать профиль');
                setText(hint, 'Перепривязку можно запрашивать не чаще одного раза в 7 дней. Текущая привязка действует до одобрения новой.');
            }
        } finally {
            relinkUiBusy = false;
        }
    }

    async function openIdentityRelinkModal() {
        const user = auth.currentUser;
        if (!user || !currentAccountProfile?.identityVerified) {
            showToast('Перепривязка доступна только для подтверждённого аккаунта.');
            return;
        }
        if (currentIdentityClaims.some(c => c?.status === 'pending')) {
            showToast('У вас уже есть заявка на проверке.');
            return;
        }

        const slot = await readRelinkSlot(user.uid);
        const lastAt = Number(slot?.at || 0);
        const remaining = lastAt ? RELINK_COOLDOWN_MS - (Date.now() - lastAt) : 0;
        if (remaining > 0) {
            showToast(`Перепривязка будет доступна через ${formatRemaining(remaining)}.`);
            ensureRelinkButton();
            return;
        }

        relinkMode = true;
        const modal = document.getElementById('identityClaimModal');
        const title = modal?.querySelector('.account-modal-title');
        const sub = modal?.querySelector('.account-modal-sub');
        if (title) title.textContent = 'Перепривязка Night GDPS';
        if (sub) sub.textContent = 'Новая привязка будет проверена модератором. До одобрения продолжит действовать текущий профиль.';

        document.getElementById('identityClaimAccountId').value = currentAccountProfile.gdpsAccountId || '';
        document.getElementById('identityClaimGdpsName').value = currentAccountProfile.verifiedGdpsUsername || currentAccountProfile.gdpsUsername || '';
        const currentPlayer = currentAccountProfile.verifiedDemonListUsername || currentAccountProfile.demonListUsername || '';
        document.getElementById('identityClaimPlayerSearch').value = currentPlayer;
        document.getElementById('identityClaimPlayerKey').value = currentPlayer ? identityPlayerKey(currentPlayer) : '';
        document.getElementById('identityClaimComment').value = '';
        document.getElementById('identityClaimError').textContent = '';
        document.getElementById('identityClaimPlayerHint').textContent = currentPlayer
            ? `Текущий профиль: ${currentPlayer}. Выберите новый профиль из списка или очистите поле.`
            : 'Выберите существующий профиль Demon List или оставьте поле пустым.';
        document.getElementById('identityClaimPlayerResults').classList.remove('show');
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeIdentityClaimModal = function patchedCloseIdentityClaimModal() {
        relinkMode = false;
        const modal = document.getElementById('identityClaimModal');
        const title = modal?.querySelector('.account-modal-title');
        const sub = modal?.querySelector('.account-modal-sub');
        if (title) title.textContent = 'Подтверждение Night GDPS';
        if (sub) sub.textContent = 'Заявка будет проверена модератором. Один Night GDPS accountID может быть связан только с одним аккаунтом сайта.';
        return originalCloseIdentityClaimModal();
    };

    submitIdentityClaim = async function patchedSubmitIdentityClaim() {
        if (!relinkMode) return originalSubmitIdentityClaim();

        const user = auth.currentUser;
        const errorEl = document.getElementById('identityClaimError');
        const button = document.getElementById('identityClaimSubmit');
        if (errorEl) errorEl.textContent = '';
        if (!user || !currentAccountProfile?.identityVerified) {
            if (errorEl) errorEl.textContent = 'Текущий аккаунт не подтверждён.';
            return;
        }
        if (currentIdentityClaims.some(c => c?.status === 'pending')) {
            if (errorEl) errorEl.textContent = 'У вас уже есть заявка на проверке.';
            return;
        }

        const accountId = cleanProfileText(document.getElementById('identityClaimAccountId').value, 20);
        const gdpsName = cleanName(document.getElementById('identityClaimGdpsName').value);
        const playerText = cleanName(document.getElementById('identityClaimPlayerSearch').value);
        const comment = cleanProfileText(document.getElementById('identityClaimComment').value, 400);

        if (!/^([1-9][0-9]{0,3}|10000)$/.test(accountId)) {
            if (errorEl) errorEl.textContent = 'Night GDPS accountID должен быть числом от 1 до 10000.';
            return;
        }
        if (!gdpsName) {
            if (errorEl) errorEl.textContent = 'Укажите ник на Night GDPS.';
            return;
        }

        let playerName = '';
        let playerKey = '';
        if (playerText) {
            playerName = officialIdentityPlayers().find(name => sameName(name, playerText)) || '';
            if (!playerName) {
                if (errorEl) errorEl.textContent = 'Если указываете Demon List профиль, выберите существующего игрока из списка.';
                return;
            }
            playerKey = identityPlayerKey(playerName);
        }

        button.disabled = true;
        const claimRef = db.ref('profileClaims').push();
        const slotRef = db.ref(`identityRelinkSlots/${user.uid}`);
        const requestedAt = Date.now();

        try {
            const slotTx = await slotRef.transaction(current => {
                const lastAt = Number(current?.at || 0);
                if (lastAt && requestedAt - lastAt < RELINK_COOLDOWN_MS) return;
                return { claimId: claimRef.key, at: requestedAt };
            });
            if (!slotTx.committed) {
                const current = slotTx.snapshot.val() || {};
                const remaining = RELINK_COOLDOWN_MS - (Date.now() - Number(current.at || 0));
                throw new Error(`Перепривязка доступна не чаще раза в 7 дней${remaining > 0 ? `. Осталось ${formatRemaining(remaining)}` : ''}.`);
            }

            const claim = {
                userUid: user.uid,
                username: currentAccountProfile.username || '',
                displayName: currentAccountProfile.displayName || '',
                gdpsAccountId: accountId,
                requestedGdpsUsername: gdpsName,
                requestedPlayerKey: playerKey,
                requestedPlayerName: playerName,
                comment,
                claimType: 'relink',
                status: 'pending',
                moderatorUid: null,
                moderatorName: null,
                moderatorMessage: null,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                reviewedAt: null
            };

            try {
                await claimRef.set(claim);
            } catch (claimError) {
                await slotRef.remove().catch(() => {});
                throw claimError;
            }

            relinkMode = false;
            closeIdentityClaimModal();
            showToast('Заявка на перепривязку отправлена. Текущий профиль останется активным до решения модератора.');
            setTimeout(ensureRelinkButton, 100);
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error?.code === 'PERMISSION_DENIED'
                    ? 'Firebase Rules пока не разрешают перепривязку профиля.'
                    : (error?.message || 'Не удалось отправить заявку на перепривязку.');
            }
        } finally {
            button.disabled = false;
        }
    };

    async function moderateRelinkClaim(id, action, reason) {
        if (action === 'reject') return originalModerateIdentityClaim(id, action, reason);

        const claimRef = db.ref(`profileClaims/${id}`);
        const claimTx = await claimRef.transaction(c => {
            if (!c || c.status !== 'pending' || c.claimType !== 'relink') return;
            c.reviewLock = auth.currentUser.uid;
            return c;
        });
        if (!claimTx.committed) throw new Error('Эта заявка уже обработана.');

        const c = claimTx.snapshot.val();
        const modUid = auth.currentUser.uid;
        const modName = moderatorDisplayName();
        const userSnap = await db.ref(`users/${c.userUid}`).once('value');
        const profile = userSnap.val();
        if (!profile?.identityVerified) {
            await claimRef.child('reviewLock').remove().catch(() => {});
            throw new Error('Профиль пользователя больше не находится в подтверждённом состоянии.');
        }

        const oldAccountId = String(profile.gdpsAccountId || '').trim();
        const oldPlayerName = cleanName(profile.verifiedDemonListUsername || '');
        const oldPlayerKey = oldPlayerName ? identityPlayerKey(oldPlayerName) : '';
        const newPlayerKey = c.requestedPlayerKey || '';

        const accountSnap = await db.ref(`gdpsAccountLinks/${c.gdpsAccountId}`).once('value');
        if (accountSnap.exists() && accountSnap.val() !== c.userUid) {
            await claimRef.child('reviewLock').remove().catch(() => {});
            throw new Error('Этот Night GDPS accountID уже принадлежит другому аккаунту сайта.');
        }
        if (newPlayerKey) {
            const playerSnap = await db.ref(`officialPlayerLinks/${newPlayerKey}`).once('value');
            if (playerSnap.exists() && playerSnap.child('linkedUid').val() !== c.userUid) {
                await claimRef.child('reviewLock').remove().catch(() => {});
                throw new Error('Этот официальный профиль Demon List уже привязан к другому аккаунту.');
            }
        }

        const now = firebase.database.ServerValue.TIMESTAMP;
        const updates = {};

        if (oldAccountId && oldAccountId !== c.gdpsAccountId) {
            updates[`gdpsAccountLinks/${oldAccountId}`] = null;
            updates[`gdpsAccountTaken/${oldAccountId}`] = null;
        }
        updates[`gdpsAccountLinks/${c.gdpsAccountId}`] = c.userUid;
        updates[`gdpsAccountTaken/${c.gdpsAccountId}`] = true;

        if (oldPlayerKey && oldPlayerKey !== newPlayerKey) {
            updates[`officialPlayerLinks/${oldPlayerKey}`] = null;
        }
        if (newPlayerKey) {
            updates[`officialPlayerLinks/${newPlayerKey}`] = {
                linkedUid: c.userUid,
                playerName: c.requestedPlayerName,
                gdpsAccountId: c.gdpsAccountId,
                verifiedAt: Date.now()
            };
            updates[`reservedNames/${accountUsernameKey(c.requestedPlayerName)}`] = c.requestedPlayerName;
            const country = String(profile.country || '').toUpperCase();
            if (/^[A-Z]{2}$/.test(country) && !/[.#$[\]\/]/.test(c.requestedPlayerName)) {
                updates[`players/${c.requestedPlayerName}/country`] = country;
            }
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

        const logKey = db.ref('auditLogs').push().key;
        updates[`auditLogs/${logKey}`] = {
            moderatorUid: modUid,
            moderatorName: modName,
            action: 'identity_approved',
            submissionId: id,
            targetUid: c.userUid || '',
            createdAt: now,
            details: {
                gdpsAccountId: c.gdpsAccountId || '',
                playerName: c.requestedPlayerName || ''
            }
        };

        try {
            await db.ref().update(updates);
        } catch (error) {
            await claimRef.child('reviewLock').remove().catch(() => {});
            throw error;
        }
    }

    moderateIdentityClaim = async function patchedModerateIdentityClaim(id, action, reason) {
        if (!id) return originalModerateIdentityClaim(id, action, reason);
        try {
            const snap = await db.ref(`profileClaims/${id}`).once('value');
            const claim = snap.val();
            if (claim?.claimType === 'relink') return moderateRelinkClaim(id, action, reason);
        } catch (_) {}
        return originalModerateIdentityClaim(id, action, reason);
    };

    function markRelinkClaims() {
        const root = document.getElementById('identityModerationList');
        if (!root) return;
        let items = [];
        try { items = identityModerationClaims.filter(c => c.status === currentIdentityModerationTab); }
        catch (_) { return; }
        const cards = root.querySelectorAll('.moderation-card');
        cards.forEach((card, index) => {
            const claim = items[index];
            if (!claim || claim.claimType !== 'relink') return;
            const title = card.querySelector('.moderation-level-name');
            if (title && !title.querySelector('.identity-relink-label')) {
                const badge = document.createElement('span');
                badge.className = 'identity-status pending identity-relink-label';
                badge.style.marginLeft = '8px';
                badge.style.fontSize = '.65rem';
                badge.textContent = 'Перепривязка';
                title.appendChild(badge);
            }
        });
    }

    renderIdentityModerationList = function patchedRenderIdentityModerationList() {
        const result = originalRenderIdentityModerationList();
        markRelinkClaims();
        return result;
    };

    function injectAdminRenameUi() {
        if (document.getElementById('adminRenamePlayerRecordsButton')) return;
        const adminControls = document.getElementById('adminControls');
        if (!adminControls) return;

        const button = document.createElement('button');
        button.id = 'adminRenamePlayerRecordsButton';
        button.type = 'button';
        button.className = 'btn-more';
        button.style.cssText = 'width:100%;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.28);color:#8db7eb;margin:10px 0 0;';
        button.innerHTML = '<i class="fas fa-user-edit"></i> СМЕНА НИКА ИГРОКА';
        button.addEventListener('click', () => {
            if (!isAdmin) { showToast('Только администратор может менять ник во всех рекордах.'); return; }
            document.getElementById('adminRenamePlayerOld').value = '';
            document.getElementById('adminRenamePlayerNew').value = '';
            document.getElementById('adminRenamePlayerError').textContent = '';
            document.getElementById('adminRenamePlayerModal').classList.add('open');
            document.body.style.overflow = 'hidden';
        });

        const select = document.getElementById('admAction');
        if (select) select.insertAdjacentElement('afterend', button);
        else adminControls.prepend(button);

        const modal = document.createElement('div');
        modal.id = 'adminRenamePlayerModal';
        modal.className = 'account-modal';
        modal.innerHTML = `
            <div class="account-modal-box">
                <button class="account-modal-close" type="button" id="adminRenamePlayerClose"><i class="fas fa-times"></i></button>
                <h2 class="account-modal-title">Смена ника игрока</h2>
                <p class="account-modal-sub">Администратор заменит ник во всех Victor-рекордах и полях Verifier в Demon, Challenge и Impossible List. Связанный подтверждённый профиль и страна также будут перенесены.</p>
                <div class="account-field">
                    <label class="account-label" for="adminRenamePlayerOld">Старый ник</label>
                    <input id="adminRenamePlayerOld" class="account-input" maxlength="40" autocomplete="off">
                </div>
                <div class="account-field">
                    <label class="account-label" for="adminRenamePlayerNew">Новый ник</label>
                    <input id="adminRenamePlayerNew" class="account-input" maxlength="40" autocomplete="off">
                </div>
                <div class="account-hint">Сравнение ников нечувствительно к регистру. Исторические заявки и audit log не переписываются.</div>
                <div id="adminRenamePlayerError" class="account-form-error"></div>
                <div class="account-actions">
                    <button id="adminRenamePlayerCancel" class="account-secondary" type="button">Отмена</button>
                    <button id="adminRenamePlayerConfirm" class="account-primary" type="button">Переименовать</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const close = () => {
            modal.classList.remove('open');
            document.body.style.overflow = '';
        };
        modal.querySelector('#adminRenamePlayerClose').addEventListener('click', close);
        modal.querySelector('#adminRenamePlayerCancel').addEventListener('click', close);
        modal.querySelector('#adminRenamePlayerConfirm').addEventListener('click', runAdminPlayerRename);
    }

    async function readLinkedUsers() {
        const snap = await db.ref('gdpsAccountLinks').once('value');
        const links = snap.val() || {};
        const uids = [...new Set(Object.values(links).filter(v => typeof v === 'string' && v))];
        const entries = await Promise.all(uids.map(async uid => {
            try {
                const userSnap = await db.ref(`users/${uid}`).once('value');
                return [uid, userSnap.val()];
            } catch (_) {
                return [uid, null];
            }
        }));
        return entries;
    }

    function collectLevelRenameUpdates(type, levels, oldName, newName, updates, counters) {
        Object.entries(levels || {}).forEach(([levelKey, level]) => {
            if (!level) return;
            if (sameName(level.verifier || '', oldName)) {
                updates[`${type}/${levelKey}/verifier`] = newName;
                counters.verifiers += 1;
            }
            Object.entries(level.victors || {}).forEach(([recordKey, record]) => {
                if (record && sameName(record.name || '', oldName)) {
                    updates[`${type}/${levelKey}/victors/${recordKey}/name`] = newName;
                    counters.records += 1;
                }
            });
        });
    }

    async function runAdminPlayerRename() {
        const errorEl = document.getElementById('adminRenamePlayerError');
        const button = document.getElementById('adminRenamePlayerConfirm');
        errorEl.textContent = '';
        if (!auth.currentUser || !isAdmin) {
            errorEl.textContent = 'Операция доступна только администратору.';
            return;
        }

        const oldName = cleanName(document.getElementById('adminRenamePlayerOld').value);
        const newName = cleanName(document.getElementById('adminRenamePlayerNew').value);
        if (!oldName || !newName) { errorEl.textContent = 'Укажите старый и новый ник.'; return; }
        if (sameName(oldName, newName) && oldName === newName) { errorEl.textContent = 'Новый ник совпадает со старым.'; return; }
        if (/[.#$[\]\/]/.test(newName)) { errorEl.textContent = 'Новый ник содержит символы, несовместимые с Firebase: . # $ [ ] /'; return; }

        if (!confirm(`Заменить ник «${oldName}» на «${newName}» во всех официальных рекордах?`)) return;

        button.disabled = true;
        button.textContent = 'Переименование...';
        try {
            const oldPlayerKey = identityPlayerKey(oldName);
            const newPlayerKey = identityPlayerKey(newName);
            const [demonsSnap, challengesSnap, impossibleSnap, playersSnap, oldLinkSnap, newLinkSnap, linkedUsers] = await Promise.all([
                db.ref('demons').once('value'),
                db.ref('challenges').once('value'),
                db.ref('impossible').once('value'),
                db.ref('players').once('value'),
                db.ref(`officialPlayerLinks/${oldPlayerKey}`).once('value'),
                db.ref(`officialPlayerLinks/${newPlayerKey}`).once('value'),
                readLinkedUsers()
            ]);

            const oldLink = oldLinkSnap.val();
            const newLink = newLinkSnap.val();
            if (oldPlayerKey !== newPlayerKey && oldLink?.linkedUid && newLink?.linkedUid && oldLink.linkedUid !== newLink.linkedUid) {
                throw new Error('Новый ник уже привязан к другому подтверждённому аккаунту.');
            }

            const updates = {};
            const counters = { records: 0, verifiers: 0, profiles: 0 };
            collectLevelRenameUpdates('demons', demonsSnap.val(), oldName, newName, updates, counters);
            collectLevelRenameUpdates('challenges', challengesSnap.val(), oldName, newName, updates, counters);
            collectLevelRenameUpdates('impossible', impossibleSnap.val(), oldName, newName, updates, counters);

            linkedUsers.forEach(([uid, profile]) => {
                if (!profile) return;
                let changed = false;
                ['verifiedGdpsUsername','verifiedDemonListUsername','gdpsUsername','demonListUsername'].forEach(field => {
                    if (sameName(profile[field] || '', oldName)) {
                        updates[`users/${uid}/${field}`] = newName;
                        changed = true;
                    }
                });
                if (changed) {
                    updates[`users/${uid}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
                    counters.profiles += 1;
                }
            });

            if (oldLink) {
                if (oldPlayerKey !== newPlayerKey) updates[`officialPlayerLinks/${oldPlayerKey}`] = null;
                updates[`officialPlayerLinks/${newPlayerKey}`] = {
                    ...oldLink,
                    playerName: newName,
                    verifiedAt: Date.now()
                };
            } else if (newLink && sameName(newLink.playerName || '', oldName)) {
                updates[`officialPlayerLinks/${newPlayerKey}/playerName`] = newName;
            }

            const players = playersSnap.val() || {};
            const oldCountryKey = Object.keys(players).find(key => sameName(key, oldName));
            const newCountryKey = Object.keys(players).find(key => sameName(key, newName));
            const country = String((oldCountryKey && players[oldCountryKey]?.country) || '').toUpperCase();
            if (/^[A-Z]{2}$/.test(country)) {
                const target = newCountryKey || newName;
                if (!players[target]?.country) updates[`players/${target}/country`] = country;
                if (oldCountryKey && oldCountryKey !== target) updates[`players/${oldCountryKey}/country`] = null;
            }

            updates[`reservedNames/${accountUsernameKey(newName)}`] = newName;

            const changedPaths = Object.keys(updates).length;
            if (!changedPaths) throw new Error('Совпадений со старым ником не найдено.');

            await db.ref().update(updates);
            document.getElementById('adminRenamePlayerModal').classList.remove('open');
            document.body.style.overflow = '';
            showToast(`Ник изменён: ${counters.records} рекордов, ${counters.verifiers} верификаций, ${counters.profiles} связанных профилей.`);
        } catch (error) {
            console.error('[Night GDPS] player rename:', error);
            errorEl.textContent = error?.code === 'PERMISSION_DENIED'
                ? 'Firebase Rules отклонили массовое переименование. Проверь права admin.'
                : (error?.message || 'Не удалось переименовать игрока.');
        } finally {
            button.disabled = false;
            button.textContent = 'Переименовать';
        }
    }

    const observer = new MutationObserver(() => {
        clearTimeout(uiRefreshTimer);
        uiRefreshTimer = setTimeout(() => {
            injectAdminRenameUi();
            ensureRelinkButton();
            markRelinkClaims();
        }, 80);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });

    auth.onAuthStateChanged(() => {
        setTimeout(() => {
            injectAdminRenameUi();
            ensureRelinkButton();
        }, 500);
    });

    injectAdminRenameUi();
    ensureRelinkButton();
})();
