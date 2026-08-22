(() => {
    'use strict';

    const canCurrentUserDeleteRecords = () => {
        if (isAdmin) return true;
        if (!isModerator) return false;

        // Existing moderators do not have this key yet. Treat an absent value as enabled
        // so the new permission works immediately for the whole moderation team.
        return currentUserPermissions.canDeleteRecords !== false;
    };

    const readDeleteRecordsCheckbox = (id) => {
        const checkbox = document.getElementById(id);
        return checkbox ? checkbox.checked : true;
    };

    // Keep the existing permissions editor intact and add only the new granular flag.
    const originalOpenEditPermModal = openEditPermModal;
    openEditPermModal = function(uid) {
        originalOpenEditPermModal(uid);

        const moderator = moderators.find(item => item.uid === uid);
        const checkbox = document.getElementById('editPermDeleteRecords');
        if (!checkbox || !moderator) return;

        const permissions = moderator.permissions || {};
        checkbox.checked = permissions.canDeleteRecords !== false;
    };

    saveModPermissions = async function() {
        if (!isAdmin) return;

        const uid = document.getElementById('editPermUid').value;
        const permissions = {
            canAddDemons: document.getElementById('editPermAddDemons').checked,
            canAddChallenges: document.getElementById('editPermAddChallenges').checked,
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
                canAddRecords: document.getElementById('permAddRecords').checked,
                canDeleteRecords: readDeleteRecordsCheckbox('permDeleteRecords'),
                canDeleteReviews: document.getElementById('permDeleteReviews').checked
            }
            : {
                canAddDemons: true,
                canAddChallenges: true,
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
            const badge = document.createElement('span');
            badge.dataset.deleteRecordsPermission = '1';
            badge.className = `perm-badge ${permissions.canDeleteRecords !== false ? 'on' : 'off'}`;
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

        if (!['demons', 'challenges'].includes(type)) {
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
