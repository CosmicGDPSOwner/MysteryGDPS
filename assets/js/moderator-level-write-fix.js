(() => {
    'use strict';

    if (typeof window.addLevelAtPosition !== 'function') {
        console.warn('[Night GDPS] Moderator level write fix: addLevelAtPosition is unavailable.');
        return;
    }

    const originalAddLevelAtPosition = window.addLevelAtPosition;

    function listFor(type) {
        if (type === 'challenges') return Array.isArray(window.challenges) ? window.challenges : challenges;
        if (type === 'impossible') return Array.isArray(window.impossibleLevels) ? window.impossibleLevels : [];
        return Array.isArray(window.demons) ? window.demons : demons;
    }

    function requiredPermission(type) {
        if (type === 'challenges') return 'canAddChallenges';
        if (type === 'impossible') return 'canAddImpossible';
        return 'canAddDemons';
    }

    function moderatorMayManage(type) {
        if (window.isAdmin) return true;
        if (!window.isModerator) return false;
        const key = requiredPermission(type);
        return currentUserPermissions && currentUserPermissions[key] === true;
    }

    async function directModeratorInsert(type, data, insertIndex) {
        if (!['demons', 'challenges', 'impossible'].includes(type)) {
            throw new Error('Неизвестный тип списка.');
        }
        if (!moderatorMayManage(type)) {
            throw new Error(`Нет разрешения ${requiredPermission(type)}.`);
        }

        const list = listFor(type);
        const safeIndex = Math.max(0, Math.min(list.length, Number(insertIndex) || 0));
        const today = new Date().toISOString().slice(0, 10);
        const newRef = db.ref(type).push();
        const newHistoryKey = newRef.child('history').push().key;
        let created = false;

        try {
            // Write exactly at /<list>/<level>. This is deliberate: moderator
            // permissions are granted at the individual level node, while the
            // original root fan-out can be rejected as one atomic operation.
            await newRef.set({
                ...data,
                order: safeIndex,
                addedAt: Date.now(),
                history: {
                    [newHistoryKey]: {
                        pos: safeIndex + 1,
                        date: today
                    }
                }
            });
            created = true;

            // Reorder existing levels using one level-scoped update per item.
            // The level rule can verify that victors remain unchanged.
            const shifts = [];
            list.forEach((item, idx) => {
                if (idx < safeIndex || !item || !item.key) return;
                const newOrder = idx + 1;
                if (Number(item.order) === newOrder) return;

                const hKey = db.ref(`${type}/${item.key}/history`).push().key;
                shifts.push(
                    db.ref(`${type}/${item.key}`).update({
                        order: newOrder,
                        [`history/${hKey}`]: {
                            pos: newOrder + 1,
                            date: today
                        }
                    })
                );
            });

            await Promise.all(shifts);
            return newRef.key;
        } catch (error) {
            // If creating the new level succeeded but a following shift failed,
            // remove the newly created level when possible instead of leaving a
            // half-completed insertion behind.
            if (created) {
                try { await newRef.remove(); } catch (_) {}
            }

            if (error?.code === 'PERMISSION_DENIED' || /permission/i.test(String(error?.message || ''))) {
                const permission = requiredPermission(type);
                throw new Error(`Firebase отклонил запись. Проверь у модератора permissions/${permission} = true.`);
            }
            throw error;
        }
    }

    window.addLevelAtPosition = function patchedAddLevelAtPosition(type, data, insertIndex) {
        // Admin keeps the original atomic fan-out. Only moderator writes need
        // the level-scoped path strategy.
        if (window.isAdmin || !window.isModerator) {
            return originalAddLevelAtPosition(type, data, insertIndex);
        }
        return directModeratorInsert(type, data, insertIndex);
    };
})();
