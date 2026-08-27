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

    function numericOrder(item, fallback) {
        const value = Number(item?.order);
        return Number.isFinite(value) ? value : fallback;
    }

    // Lists are rendered after sorting by numeric `order`. Using a midpoint lets a
    // moderator insert at an arbitrary visible position without rewriting any
    // existing level. This keeps a moderator write scoped to exactly one level node.
    function orderForInsertion(list, insertIndex) {
        const length = list.length;
        if (!length) return 0;

        const index = Math.max(0, Math.min(length, Number(insertIndex) || 0));
        if (index === 0) {
            return numericOrder(list[0], 0) - 1;
        }
        if (index >= length) {
            return numericOrder(list[length - 1], length - 1) + 1;
        }

        const before = numericOrder(list[index - 1], index - 1);
        const after = numericOrder(list[index], index);
        if (after > before) return before + (after - before) / 2;

        // Historical data should normally have increasing orders. If two entries
        // already share an order, stay close to the requested predecessor without
        // modifying either existing record.
        return before + 0.000001;
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
        const order = orderForInsertion(list, safeIndex);
        const today = new Date().toISOString().slice(0, 10);
        const newRef = db.ref(type).push();
        const newHistoryKey = newRef.child('history').push().key;

        try {
            // One level-scoped write only. No root fan-out and no writes to existing
            // levels, so Firebase only evaluates the permission for the new node.
            await newRef.set({
                ...data,
                order,
                addedAt: Date.now(),
                history: {
                    [newHistoryKey]: {
                        pos: safeIndex + 1,
                        date: today
                    }
                }
            });
            return newRef.key;
        } catch (error) {
            if (error?.code === 'PERMISSION_DENIED' || /permission/i.test(String(error?.message || ''))) {
                const permission = requiredPermission(type);
                let storedPermission = null;
                try {
                    const user = auth.currentUser;
                    if (user) {
                        const snap = await db.ref(`moderators/${user.uid}/permissions/${permission}`).once('value');
                        storedPermission = snap.val();
                    }
                } catch (_) {}

                if (storedPermission !== true) {
                    throw new Error(`Firebase отклонил запись: permissions/${permission} в базе не равен true.`);
                }
                throw new Error(`Firebase Rules отклонили создание уровня, хотя permissions/${permission} = true. Нужен актуальный набор Rules.`);
            }
            throw error;
        }
    }

    window.addLevelAtPosition = function patchedAddLevelAtPosition(type, data, insertIndex) {
        // Admin keeps the original atomic implementation. Only moderator writes use
        // the single-node strategy because their Firebase permissions are granular.
        if (window.isAdmin || !window.isModerator) {
            return originalAddLevelAtPosition(type, data, insertIndex);
        }
        return directModeratorInsert(type, data, insertIndex);
    };
})();
