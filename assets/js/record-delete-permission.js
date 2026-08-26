(() => {
    'use strict';

    const createDeleteRecordsPermissionLabel = (id) => {
        const label = document.createElement('label');
        label.className = 'perm-check-label';
        label.innerHTML = `
            <input type="checkbox" id="${id}" checked>
            <span><i class="fas fa-trash" style="color:#ff6868;margin-right:6px;"></i>Удалять рекорды</span>
        `;
        return label;
    };


    const createImpossiblePermissionLabel = (id) => {
        const label = document.createElement('label');
        label.className = 'perm-check-label';
        label.innerHTML = `
            <input type="checkbox" id="${id}" checked>
            <span><i class="fas fa-ban" style="color:#f87171;margin-right:6px;"></i>Добавлять уровни в Impossible List</span>
        `;
        return label;
    };

    const ensurePermissionCheckboxes = () => {
        const newImpossibleAnchor = document.getElementById('permAddChallenges');
        if (newImpossibleAnchor && !document.getElementById('permAddImpossible')) {
            const anchorLabel = newImpossibleAnchor.closest('label');
            if (anchorLabel) anchorLabel.insertAdjacentElement('afterend', createImpossiblePermissionLabel('permAddImpossible'));
        }

        const editImpossibleAnchor = document.getElementById('editPermAddChallenges');
        if (editImpossibleAnchor && !document.getElementById('editPermAddImpossible')) {
            const anchorLabel = editImpossibleAnchor.closest('label');
            if (anchorLabel) anchorLabel.insertAdjacentElement('afterend', createImpossiblePermissionLabel('editPermAddImpossible'));
        }

        const newModAnchor = document.getElementById('permAddRecords');
        if (newModAnchor && !document.getElementById('permDeleteRecords')) {
            const anchorLabel = newModAnchor.closest('label');
            if (anchorLabel) {
                anchorLabel.insertAdjacentElement(
                    'afterend',
                    createDeleteRecordsPermissionLabel('permDeleteRecords')
                );
            }
        }

        const editAnchor = document.getElementById('editPermAddRecords');
        if (editAnchor && !document.getElementById('editPermDeleteRecords')) {
            const anchorLabel = editAnchor.closest('label');
            if (anchorLabel) {
                anchorLabel.insertAdjacentElement(
                    'afterend',
                    createDeleteRecordsPermissionLabel('editPermDeleteRecords')
                );
            }
        }
    };

    const canCurrentUserDeleteRecords = () => {
        if (isAdmin) return true;
        if (!isModerator) return false;

        // Existing moderators do not have this key yet. An absent value therefore
        // means enabled, so the new right is available to the whole team immediately.
        return currentUserPermissions.canDeleteRecords === true;
    };

    const readDeleteRecordsCheckbox = (id) => {
        const checkbox = document.getElementById(id);
        return checkbox ? checkbox.checked : true;
    };

    ensurePermissionCheckboxes();

    // Keep the existing permissions editor intact and add only the new granular flag.
    const originalOpenEditPermModal = openEditPermModal;
    openEditPermModal = function(uid) {
        ensurePermissionCheckboxes();
        originalOpenEditPermModal(uid);

        const moderator = moderators.find(item => item.uid === uid);
        const checkbox = document.getElementById('editPermDeleteRecords');
        if (!checkbox || !moderator) return;

        const permissions = moderator.permissions || {};
        checkbox.checked = permissions.canDeleteRecords === true;
        const impossibleCheckbox = document.getElementById('editPermAddImpossible');
        if (impossibleCheckbox) impossibleCheckbox.checked = permissions.canAddImpossible === true;
    };

    saveModPermissions = async function() {
        if (!isAdmin) return;

        ensurePermissionCheckboxes();

        const uid = document.getElementById('editPermUid').value;
        const permissions = {
            canAddDemons: document.getElementById('editPermAddDemons').checked,
            canAddChallenges: document.getElementById('editPermAddChallenges').checked,
            canAddImpossible: document.getElementById('editPermAddImpossible') ? document.getElementById('editPermAddImpossible').checked : true,
            canAddRecords: document.getElementById('editPermAddRecords').checked,
            canDeleteRecords: readDeleteRecordsCheckbox('editPermDeleteRecords'),
            canDeleteReviews: document.getElementById('editPermDeleteReviews').checked
        };

        try {
            await db.ref(`moderators/${uid}/permissions`).set(permissions);

            if (auth.currentUser && auth.currentUser.uid === uid) {
                currentUserPermissions = permissions;
            }

            showToast('✅ Права обновлены!');
            document.getElementById('editPermModal').style.display = 'none';
        } catch (error) {
            showToast(`Ошибка: ${error.message}`);
        }
    };

    // New moderators receive record-deletion permission by default, but admins can
    // turn it off with the checkbox just like any other granular permission.
    addModerator = async function() {
        if (!isAdmin) return;

        ensurePermissionCheckboxes();

        const mode = document.getElementById('newModMode').value;
        const email = document.getElementById('newModEmail').value.trim();
        const pass = document.getElementById('newModPass').value;
        const uid = document.getElementById('newModUid').value.trim();
        const nick = document.getElementById('newModNick').value.trim();
        const role = document.getElementById('newModRole').value;

        const permissions = role === 'moderator'
            ? {
                canAddDemons: document.getElementById('permAddDemons').checked,
                canAddChallenges: document.getElementById('permAddChallenges').checked,
                canAddImpossible: document.getElementById('permAddImpossible') ? document.getElementById('permAddImpossible').checked : true,
                canAddRecords: document.getElementById('permAddRecords').checked,
                canDeleteRecords: readDeleteRecordsCheckbox('permDeleteRecords'),
                canDeleteReviews: document.getElementById('permDeleteReviews').checked
            }
            : {
                canAddDemons: true,
                canAddChallenges: true,
                canAddImpossible: true,
                canAddRecords: true,
                canDeleteRecords: true,
                canDeleteReviews: true
            };

        const resetForm = () => {
            document.getElementById('newModEmail').value = '';
            document.getElementById('newModPass').value = '';
            document.getElementById('newModUid').value = '';
            document.getElementById('newModNick').value = '';
            document.getElementById('permAddDemons').checked = true;
            document.getElementById('permAddChallenges').checked = true;
            const impossibleCheckbox = document.getElementById('permAddImpossible');
            if (impossibleCheckbox) impossibleCheckbox.checked = true;
            document.getElementById('permAddRecords').checked = true;

            const deleteRecordsCheckbox = document.getElementById('permDeleteRecords');
            if (deleteRecordsCheckbox) deleteRecordsCheckbox.checked = true;

            document.getElementById('permDeleteReviews').checked = false;
        };

        if (mode === 'existing') {
            if (!uid) {
                showToast('Вставь Firebase UID аккаунта');
                return;
            }

            try {
                const existingSnap = await db.ref(`moderators/${uid}`).once('value');
                if (existingSnap.exists()) {
                    showToast('У этого аккаунта уже есть права');
                    return;
                }

                await db.ref(`moderators/${uid}`).set({
                    email: email || '',
                    nick,
                    role,
                    permissions,
                    createdAt: Date.now()
                });

                showToast('✅ Права выданы! Пусть человек перезайдёт на сайт.');
                resetForm();
            } catch (error) {
                console.error(error);
                showToast(`Ошибка: ${error.message || 'неизвестная ошибка'}`);
            }
            return;
        }

        if (!email || !pass || pass.length < 6) {
            showToast('Заполни email и пароль (мин. 6 символов)');
            return;
        }

        try {
            const secondaryApp = firebase.initializeApp(firebaseConfig, `secondary_${Date.now()}`);
            const secondaryAuth = secondaryApp.auth();
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
            const newUid = cred.user.uid;

            await secondaryAuth.signOut();
            await secondaryApp.delete();

            await db.ref(`moderators/${newUid}`).set({
                email,
                nick,
                role,
                permissions,
                createdAt: Date.now()
            });

            showToast('Модератор успешно добавлен!');
            resetForm();
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                showToast('Этот email уже занят. Выбери режим «Выдать права существующему (по UID)».');
            } else {
                showToast(`Ошибка: ${error.message || 'неизвестная ошибка'}`);
            }
        }
    };

    const originalRenderModList = renderModList;
    renderModList = function() {
        originalRenderModList();

        const container = document.getElementById('modListContainer');
        if (!container) return;

        Array.from(container.children).forEach((card, index) => {
            const moderator = moderators[index];
            if (!moderator || moderator.role === 'admin') return;

            const badges = card.querySelector('.perm-badge')?.parentElement;
            if (!badges || badges.querySelector('[data-delete-records-permission]')) return;

            const permissions = moderator.permissions || {};
            if (!badges.querySelector('[data-impossible-permission]')) {
                const impossibleBadge = document.createElement('span');
                impossibleBadge.dataset.impossiblePermission = '1';
                impossibleBadge.className = `perm-badge ${permissions.canAddImpossible === true ? 'on' : 'off'}`;
                impossibleBadge.innerHTML = '<i class="fas fa-ban"></i> Impossible List';
                badges.appendChild(impossibleBadge);
            }
            const badge = document.createElement('span');
            badge.dataset.deleteRecordsPermission = '1';
            badge.className = `perm-badge ${permissions.canDeleteRecords === true ? 'on' : 'off'}`;
            badge.innerHTML = '<i class="fas fa-trash"></i> Удаление рекордов';
            badges.appendChild(badge);
        });
    };

    const injectRecordDeleteButtons = () => {
        if (!isEditMode || !canCurrentUserDeleteRecords()) return;

        document.querySelectorAll('#modalData button[onclick^="openEditRecordModal"]').forEach(editButton => {
            const actions = editButton.parentElement;
            if (!actions || actions.querySelector('.record-delete-permission-btn')) return;

            const onclick = editButton.getAttribute('onclick') || '';
            const match = onclick.match(/openEditRecordModal\('([^']+)','([^']+)','([^']+)'\)/);
            if (!match) return;

            const [, levelKey, recordKey, type] = match;
            const deleteButton = document.createElement('button');
            deleteButton.className = 'record-delete-permission-btn';
            deleteButton.title = 'Удалить рекорд';
            deleteButton.style.cssText = 'background:transparent;border:none;color:#ff4d4d;cursor:pointer;font-size:0.9rem;';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.addEventListener('click', () => deleteVictor(levelKey, recordKey, type));
            actions.appendChild(deleteButton);
        });
    };

    const originalShowInfoByKey = showInfoByKey;
    showInfoByKey = function(key, type = 'demons') {
        originalShowInfoByKey(key, type);
        injectRecordDeleteButtons();
    };

    deleteVictor = function(levelKey, recordKey, type = 'demons') {
        if (!canCurrentUserDeleteRecords()) {
            showToast('Нет прав: удаление рекордов не разрешено!');
            return;
        }

        if (!['demons', 'challenges', 'impossible'].includes(type)) {
            showToast('Недопустимый путь удаления!');
            return;
        }

        const question = currentLang === 'EN' ? 'Delete record?' : 'Удалить рекорд?';
        if (!confirm(question)) return;

        db.ref(`${type}/${levelKey}/victors/${recordKey}`).remove()
            .then(() => {
                document.getElementById('detailModal').style.display = 'none';
                showToast('🗑️ Рекорд удален');
            })
            .catch(error => showToast(`Ошибка: ${error.message}`));
    };
})();
