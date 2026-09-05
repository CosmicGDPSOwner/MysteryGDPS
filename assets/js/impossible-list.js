(() => {
    'use strict';

    const listPath = 'impossible';
    window.impossibleLevels = window.impossibleLevels || [];
    const impossible = () => window.impossibleLevels;

    // ===== FPS: сортировка и фильтры Impossible List =====
    const fpsState = { sort: 'default', exact: null, noFpsOnly: false };
    const fpsNum = d => {
        const raw = (d && d.fps !== undefined && d.fps !== null) ? String(d.fps).trim() : '';
        if (raw === '') return null;
        const v = parseInt(raw, 10);
        return isNaN(v) ? null : v;
    };
    function syncFpsFilterSection() {
        const sec = document.getElementById('filterFpsSection');
        if (sec) sec.style.display = (currentTab === 'impossible') ? 'block' : 'none';
    }
    window.setFpsSort = function(mode) {
        fpsState.sort = mode;
        document.querySelectorAll('#filterFpsPills .filter-pill').forEach(b => b.classList.toggle('active', b.dataset.fpssort === mode));
        render();
    };
    window.onFpsNoToggle = function() {
        const el = document.getElementById('filterNoFps');
        fpsState.noFpsOnly = !!(el && el.checked);
        render();
    };
    window.applyFpsExact = function() {
        const el = document.getElementById('filterFpsExact');
        const raw = el ? String(el.value || '').trim() : '';
        fpsState.exact = (raw === '' || isNaN(parseInt(raw, 10))) ? null : parseInt(raw, 10);
        render();
    };
    window.resetFpsFilters = function() {
        fpsState.sort = 'default'; fpsState.exact = null; fpsState.noFpsOnly = false;
        const ex = document.getElementById('filterFpsExact'); if (ex) ex.value = '';
        const nf = document.getElementById('filterNoFps'); if (nf) nf.checked = false;
        document.querySelectorAll('#filterFpsPills .filter-pill').forEach(b => b.classList.toggle('active', b.dataset.fpssort === 'default'));
    };
    if (typeof window.resetFilters === 'function') {
        const originalResetFilters = window.resetFilters;
        window.resetFilters = function() { window.resetFpsFilters(); return originalResetFilters(); };
    }

    const canManageImpossible = () => !!(isAdmin || (isModerator && currentUserPermissions.canAddImpossible === true));
    const canDeleteRecords = () => !!(isAdmin || (isModerator && currentUserPermissions.canDeleteRecords === true));

    const listFor = type => type === 'challenges' ? challenges : type === 'impossible' ? impossible() : demons;
    const youtubeId = raw => {
        const value = String(raw || '').trim();
        if (value.includes('v=')) return value.split('v=')[1].split('&')[0];
        if (value.includes('youtu.be/')) return value.split('youtu.be/')[1].split('?')[0];
        if (value.includes('/shorts/')) return value.split('/shorts/')[1].split(/[?&]/)[0];
        return value;
    };

    function impossibleLabel() { return currentLang === 'EN' ? 'IMPOSSIBLE LEVEL LIST' : 'IMPOSSIBLE LEVEL LIST'; }

    // Let saved navigation accept the new list.
    try { VALID_LIST_TABS.add('impossible'); } catch (_) {}

    // Permissions used by edit/drag modes.
    const originalCanEditTab = canEditTab;
    canEditTab = function(tab) {
        if (tab === 'impossible') return canManageImpossible();
        return originalCanEditTab(tab);
    };

    // Duplicate Level ID protection includes the Impossible List.
    const originalFindDuplicateLevelByID = findDuplicateLevelByID;
    findDuplicateLevelByID = function(levelID) {
        const existing = originalFindDuplicateLevelByID(levelID);
        if (existing) return existing;
        const id = normalizeLevelID(levelID);
        if (!id) return null;
        const item = impossible().find(level => normalizeLevelID(level.levelID) === id);
        return item ? { type:'impossible', item } : null;
    };
    const originalDuplicateLevelMessage = duplicateLevelMessage;
    duplicateLevelMessage = function(dup, levelID) {
        if (dup && dup.type === 'impossible') return `Уровень с ID ${levelID} уже находится в Impossible List: ${dup.item.name || 'без названия'}`;
        return originalDuplicateLevelMessage(dup, levelID);
    };

    // Position selector for moderator/admin forms.
    const originalPopulatePositionSelect = populatePositionSelect;
    populatePositionSelect = function(selectId, type, shouldUpdate = true) {
        if (type !== 'impossible') return originalPopulatePositionSelect(selectId, type, shouldUpdate);
        if (!shouldUpdate) return;
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const previous = sel.value;
        const list = impossible();
        let html = '';
        for (let pos = 1; pos <= list.length; pos++) {
            html += `<option value="${pos}">#${pos} — перед ${escapeHtml(list[pos-1].name || 'уровнем')}</option>`;
        }
        html += '<option value="end">В конец списка</option>';
        sel.innerHTML = html;
        if ([...sel.options].some(o => o.value === previous)) sel.value = previous;
        else sel.value = 'end';
    };

    function setImpossibleTabUi(remember = true) {
        currentTab = 'impossible';
        if (remember) {
            try {
                localStorage.setItem(NAV_SECTION_KEY, 'listSection');
                localStorage.setItem(NAV_TAB_KEY, 'impossible');
            } catch (_) {}
        }
        const tabs = ['tabDemonsBtn','tabChallengesBtn','tabImpossibleBtn','tabPlayersBtn','tabCreatorTopBtn','tabPlayerSearchBtn'];
        tabs.forEach(id => document.getElementById(id)?.classList.toggle('active', id === 'tabImpossibleBtn'));
        document.getElementById('mainContainer').style.display = 'grid';
        document.getElementById('playerTopSection').style.display = 'none';
        document.getElementById('creatorTopSection').style.display = 'none';
        document.getElementById('playerSearchSection').style.display = 'none';
        document.getElementById('searchBoxWrap').style.display = 'block';
        document.getElementById('top50Banner').style.display = 'none';
        document.getElementById('txtHero').innerText = impossibleLabel();
        syncFpsFilterSection();
        render();
    }

    const originalSwitchTab = switchTab;
    switchTab = function(tab, remember = true) {
        if (tab === 'impossible') return setImpossibleTabUi(remember);
        const res = originalSwitchTab(tab, remember);
        syncFpsFilterSection();
        return res;
    };

    function impossibleFiltered() {
        const query = String(document.getElementById('searchInput')?.value || '').trim().toLowerCase();
        const now = Date.now();
        return impossible().filter(d => {
            if (query && ![d.name,d.author,d.tag,d.levelID].some(v => String(v || '').toLowerCase().includes(query))) return false;
            if (filterState.status !== 'all') {
                if (filterState.status === 'none') { if (d.status) return false; }
                else if (d.status !== filterState.status) return false;
            }
            if (filterState.verified && !(d.verifier && d.verifier.trim())) return false;
            if (filterState.newOnly && !(d.addedAt && (now - d.addedAt) <= NEW_LEVEL_MS)) return false;
            const p = parseFloat(d.points);
            if (filterState.ptsMin !== null && (isNaN(p) || p < filterState.ptsMin)) return false;
            if (filterState.ptsMax !== null && (isNaN(p) || p > filterState.ptsMax)) return false;
            if (fpsState.noFpsOnly && fpsNum(d) !== null) return false;
            if (fpsState.exact !== null) { const f = fpsNum(d); if (f === null || f !== fpsState.exact) return false; }
            return true;
        });
    }

    function impossibleDragStart(index, event) {
        if (!isDragDropMode || !canManageImpossible()) { event.preventDefault(); return; }
        draggedIndex = index;
        draggedItem = impossible()[index];
        event.dataTransfer.setData('text/plain', String(index));
        event.dataTransfer.effectAllowed = 'move';
        event.currentTarget.classList.add('dragging');
    }
    function impossibleDragOver(index, event) {
        if (!isDragDropMode || draggedIndex === -1) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('#mainContainer .card').forEach(c => c.classList.remove('drag-over','drag-over-before','drag-over-after'));
        if (index !== draggedIndex) event.currentTarget.classList.add('drag-over', index < draggedIndex ? 'drag-over-before' : 'drag-over-after');
    }
    function impossibleDrop(targetIndex, event) {
        event.preventDefault();
        document.querySelectorAll('#mainContainer .card').forEach(c => c.classList.remove('drag-over','drag-over-before','drag-over-after'));
        if (!isDragDropMode || !canManageImpossible() || draggedIndex < 0 || draggedIndex === targetIndex) return;
        const ordered = [...impossible()];
        const [moved] = ordered.splice(draggedIndex, 1);
        ordered.splice(targetIndex, 0, moved);
        const today = new Date().toISOString().slice(0,10);
        const updates = {};
        ordered.forEach((item, idx) => {
            if (item.order !== idx) {
                updates[`/impossible/${item.key}/order`] = idx;
                const hKey = db.ref(`/impossible/${item.key}/history`).push().key;
                updates[`/impossible/${item.key}/history/${hKey}`] = { pos: idx + 1, date: today };
            }
        });
        db.ref().update(updates).then(() => showToast('Порядок Impossible List обновлён')).catch(e => showToast('Ошибка: ' + e.message));
        draggedIndex = -1; draggedItem = null;
    }

    function renderImpossible() {
        const container = document.getElementById('mainContainer');
        if (!container) return;
        syncLevelViewModeUI();
        container.innerHTML = '';
        container.style.display = 'grid';
        const filtered = impossibleFiltered();
        if (fpsState.sort === 'fps_desc') filtered.sort((a, b) => (fpsNum(b) || 0) - (fpsNum(a) || 0));
        else if (fpsState.sort === 'fps_asc') filtered.sort((a, b) => (fpsNum(a) || 0) - (fpsNum(b) || 0));
        if (!filtered.length) {
            container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#64748b;border:1px solid rgba(148,163,184,.10);border-radius:16px;background:rgba(255,255,255,.02);">${currentLang === 'EN' ? 'Impossible List is empty.' : 'Impossible List пока пуст.'}</div>`;
            return;
        }
        const canEdit = canManageImpossible();
        const fragment = document.createDocumentFragment();
        filtered.forEach(d => {
            const realIndex = impossible().findIndex(x => x.key === d.key);
            const card = document.createElement('div');
            card.className = 'card impossible-card';
            if (isDragDropMode && canEdit) {
                card.draggable = true;
                card.ondragstart = e => impossibleDragStart(realIndex, e);
                card.ondragover = e => impossibleDragOver(realIndex, e);
                card.ondragleave = handleDragLeave;
                card.ondrop = e => impossibleDrop(realIndex, e);
                card.ondragend = handleDragEnd;
            }
            let controls = '';
            if (isDeleteMode && isAdmin) {
                controls = `<div class="admin-controls"><button class="ctrl-btn btn-up" onclick="moveItem(${realIndex},-1,'impossible')"><i class="fas fa-arrow-up"></i></button><button class="ctrl-btn btn-down" onclick="moveItem(${realIndex},1,'impossible')"><i class="fas fa-arrow-down"></i></button><button class="ctrl-btn btn-edit" onclick="openEditModal('${d.key}','impossible')"><i class="fas fa-pen"></i></button><button class="ctrl-btn btn-history" onclick="event.stopPropagation();clearItemPositionHistory('${d.key}','impossible')"><i class="fas fa-broom"></i></button><button class="ctrl-btn btn-del" onclick="deleteItem('${d.key}','impossible')"><i class="fas fa-trash"></i></button></div>`;
            } else if (isEditMode && canEdit) {
                controls = `<div class="admin-controls"><button class="ctrl-btn btn-up" onclick="moveItem(${realIndex},-1,'impossible')"><i class="fas fa-arrow-up"></i></button><button class="ctrl-btn btn-down" onclick="moveItem(${realIndex},1,'impossible')"><i class="fas fa-arrow-down"></i></button><button class="ctrl-btn btn-edit" onclick="openEditModal('${d.key}','impossible')"><i class="fas fa-pen"></i></button>${isAdmin ? `<button class="ctrl-btn btn-history" onclick="event.stopPropagation();clearItemPositionHistory('${d.key}','impossible')"><i class="fas fa-broom"></i></button>` : ''}</div>`;
            }
            const pts = parseFloat(d.points);
            const fps = fpsNum(d);
            const verifier = String(d.verifier || '').trim();
            card.onclick = event => {
                if (levelViewMode !== 'grid') return;
                if (event.target.closest('button,a,.level-id-box,.admin-controls')) return;
                showInfoByKey(d.key, 'impossible');
            };
            card.innerHTML = `${controls}<div class="card-img-wrap">${d.tag ? `<div class="demon-tag">${escapeHtml(d.tag)}</div>` : ''}<img src="${escapeHtml(d.img || '')}" class="card-img" loading="lazy" decoding="async" alt="${escapeHtml(d.name || '')}" onerror="this.onerror=null;this.removeAttribute('src')">${statusBadgeHtml(d.status)}</div><div class="card-body"><div class="card-rank-name"><span class="card-rank">#${realIndex+1}</span><span class="card-title">${escapeHtml(d.name || '')}</span></div><div class="card-meta"><span class="card-author">${escapeHtml(d.author || '')}</span>${verifier ? `<span class="card-meta-sep">|</span><span class="card-verifier-name">${escapeHtml(verifier)}</span>` : ''}</div><div class="card-actions"><div class="level-id-box" onclick="copyID('${escapeHtml(d.levelID || '')}')" style="margin:0;padding:6px 12px;font-size:.78rem;"><i class="fas fa-hashtag" style="font-size:.68rem;"></i> ${escapeHtml(d.levelID || '—')}</div>${fps !== null ? `<div class="level-id-box" style="margin:0;padding:6px 12px;font-size:.78rem;color:#60a5fa;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.08);cursor:default;" title="${currentLang === 'EN' ? 'Possible at this FPS' : 'Возможен на этом FPS'}"><i class="fas fa-film" style="font-size:.68rem;"></i> ${fps} FPS</div>` : ''}<button class="btn-more" onclick="showInfoByKey('${d.key}','impossible')" style="padding:7px 16px;font-size:.78rem;">${currentLang === 'EN' ? 'DETAILS' : 'ПОДРОБНЕЕ'}</button></div></div>`;
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
    }

    const originalRender = render;
    render = function() {
        if (currentTab === 'impossible') return renderImpossible();
        return originalRender();
    };

    // Editing a level reuses the current edit modal and save routine.
    const originalOpenEditModal = openEditModal;
    openEditModal = function(key, type = 'demons') {
        if (type !== 'impossible') { const w = document.getElementById('editFPSWrap'); if (w) w.style.display = 'none'; return originalOpenEditModal(key, type); }
        if (!isModerator || !canManageImpossible()) return;
        const d = impossible().find(x => x.key === key);
        if (!d) return;
        document.getElementById('editItemType').value = 'impossible';
        document.getElementById('editDemonKey').value = key;
        document.getElementById('editName').value = d.name || '';
        document.getElementById('editAuthor').value = d.author || '';
        document.getElementById('editVerifier').value = d.verifier || '';
        document.getElementById('editLevelID').value = d.levelID || '';
        document.getElementById('editTag').value = d.tag || '';
        document.getElementById('editImg').value = d.img || '';
        document.getElementById('editVid').value = d.vid ? `https://youtube.com/watch?v=${d.vid}` : '';
        document.getElementById('editPoints').value = d.points || '';
        document.getElementById('editStatus').value = d.status || '';
        const editFpsWrap = document.getElementById('editFPSWrap');
        if (editFpsWrap) editFpsWrap.style.display = 'block';
        const editFpsInput = document.getElementById('editFPS');
        if (editFpsInput) editFpsInput.value = (d.fps !== undefined && d.fps !== null && String(d.fps).trim() !== '') ? d.fps : '';
        updateImgPreview();
        document.getElementById('editDemonModal').style.display = 'block';
        document.getElementById('editDemonModal').scrollTop = 0;
    };

    const originalSaveDemonEdit = saveDemonEdit;
    saveDemonEdit = function() {
        const type = document.getElementById('editItemType').value;
        if (type !== 'impossible') return originalSaveDemonEdit();
        const key = document.getElementById('editDemonKey').value;
        const name = document.getElementById('editName').value.trim();
        if (!name) { showToast('Введи название уровня'); return; }
        const author = document.getElementById('editAuthor').value.trim();
        const verifier = document.getElementById('editVerifier').value.trim();
        const levelID = document.getElementById('editLevelID').value.trim();
        const tag = document.getElementById('editTag').value.trim();
        const img = document.getElementById('editImg').value.trim();
        let vidRaw = document.getElementById('editVid').value.trim();
        let vid = vidRaw;
        if (vidRaw.includes('v=')) vid = vidRaw.split('v=')[1].split('&')[0];
        else if (vidRaw.includes('youtu.be/')) vid = vidRaw.split('youtu.be/')[1].split('?')[0];
        const points = document.getElementById('editPoints').value.trim();
        const status = document.getElementById('editStatus').value;
        const fpsRaw = (document.getElementById('editFPS')?.value || '').trim();
        const fpsVal = (fpsRaw !== '' && !isNaN(parseInt(fpsRaw, 10))) ? parseInt(fpsRaw, 10) : null;
        db.ref('impossible/' + key).update({ name, author, verifier, levelID, tag, img, vid, points, status, fps: fpsVal }).then(() => {
            showToast('Успешно обновлено!');
            closeEditModal();
        }).catch(e => showToast('Ошибка: ' + e.message));
    };
    
    const originalOpenEditRecordModal = openEditRecordModal;
    openEditRecordModal = function(levelKey, recordKey, type) {
        if (type !== 'impossible') return originalOpenEditRecordModal(levelKey, recordKey, type);
        const level = impossible().find(x => x.key === levelKey);
        const rec = level?.victors?.[recordKey];
        if (!rec) return;
        document.getElementById('editRecDemonKey').value = levelKey;
        document.getElementById('editRecKey').value = recordKey;
        document.getElementById('editRecType').value = 'impossible';
        document.getElementById('editRecName').value = rec.name || '';
        document.getElementById('editRecPerc').value = rec.perc || '';
        document.getElementById('editRecAtt').value = rec.att || '';
        document.getElementById('editRecVid').value = rec.vid ? `https://youtube.com/watch?v=${rec.vid}` : '';
        document.getElementById('editRecordModal').style.display = 'block';
    };

    const originalMoveItem = moveItem;
    moveItem = function(index, dir, type = 'demons') {
        if (type !== 'impossible') return originalMoveItem(index, dir, type);
        if (!canManageImpossible()) return;
        const list = impossible();
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        const today = new Date().toISOString().slice(0,10);
        const updates = {};
        updates[`/impossible/${list[index].key}/order`] = target;
        updates[`/impossible/${list[target].key}/order`] = index;
        const a = db.ref(`/impossible/${list[index].key}/history`).push().key;
        const b = db.ref(`/impossible/${list[target].key}/history`).push().key;
        updates[`/impossible/${list[index].key}/history/${a}`] = { pos:target+1, date:today };
        updates[`/impossible/${list[target].key}/history/${b}`] = { pos:index+1, date:today };
        db.ref().update(updates).catch(e => showToast('Ошибка: ' + e.message));
    };

    const originalDeleteItem = deleteItem;
    deleteItem = function(key, path) {
        if (path !== 'impossible') return originalDeleteItem(key, path);
        if (!isAdmin) { showToast('Нет доступа!'); return; }
        if (confirm(currentLang === 'EN' ? 'Delete this Impossible level?' : 'Удалить этот Impossible уровень?')) db.ref(`impossible/${key}`).remove();
    };

    const originalClearItemPositionHistory = clearItemPositionHistory;
    clearItemPositionHistory = function(key, type = 'demons') {
        if (type !== 'impossible') return originalClearItemPositionHistory(key, type);
        if (!isAdmin) { showToast('Только администратор может очищать историю позиций'); return; }
        const item = impossible().find(x => x.key === key);
        if (!item) return;
        const count = item.history ? Object.keys(item.history).length : 0;
        if (!count) { showToast('У этого уровня история позиций уже пустая'); return; }
        if (!confirm(`Очистить историю позиций уровня «${item.name}»?`)) return;
        db.ref(`impossible/${key}/history`).remove().then(() => showToast('История позиций очищена')).catch(e => showToast('Ошибка: ' + e.message));
    };

    // Detail view with record edit/delete parity.
    const originalShowInfoByKey = showInfoByKey;
    showInfoByKey = function(key, type = 'demons') {
        if (type !== 'impossible') return originalShowInfoByKey(key, type);
        currentModalKey = key;
        currentModalType = 'impossible';
        const list = impossible();
        const d = list.find(x => x.key === key);
        if (!d) return;
        const idx = list.indexOf(d);
        const records = d.victors ? Object.entries(d.victors) : [];
        const recordHtml = records.length ? records.map(([rk,r]) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;"><div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><b style="color:#fff;font-size:.92rem;">${escapeHtml(r.name || '')}</b><span style="background:rgba(167,139,250,.12);color:var(--accent);font-size:.72rem;font-weight:900;padding:2px 8px;border-radius:6px;font-family:'Orbitron';">${escapeHtml(r.perc || '100%')}</span>${r.att ? `<span style="color:#4b5563;font-size:.75rem;">${escapeHtml(r.att)} att</span>` : ''}</div>${r.vid ? `<a href="https://youtube.com/watch?v=${encodeURIComponent(r.vid)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;color:#f87171;font-size:.72rem;font-weight:700;text-decoration:none;width:fit-content;"><i class="fab fa-youtube"></i> Видео</a>` : ''}</div><div style="display:flex;gap:6px;align-items:center;">${isEditMode && isModerator ? `<button style="background:transparent;border:none;color:#f39c12;cursor:pointer;" onclick="openEditRecordModal('${d.key}','${rk}','impossible')"><i class="fas fa-pen"></i></button>` : ''}${isEditMode && canDeleteRecords() ? `<button style="background:transparent;border:none;color:#ff4d4d;cursor:pointer;" onclick="deleteVictor('${d.key}','${rk}','impossible')"><i class="fas fa-trash"></i></button>` : ''}</div></div>`).join('') : `<p style="color:#4b5563;text-align:center;padding:20px 0;font-size:.88rem;">${currentLang === 'EN' ? 'No records yet' : 'Рекордов пока нет'}</p>`;
        const historyData = d.history ? Object.values(d.history).sort((a,b) => String(a.date||'').localeCompare(String(b.date||''))) : [];
        const historyList = historyData.length ? `<div style="margin-top:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px 16px;"><div style="font-size:.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">${currentLang === 'EN' ? 'Position history' : 'История позиций'}</div><div style="display:flex;gap:6px;flex-wrap:wrap;">${historyData.slice(-12).map(h => `<span style="padding:4px 7px;border-radius:6px;background:rgba(148,163,184,.07);color:#94a3b8;font-size:.72rem;">#${escapeHtml(h.pos)} ${escapeHtml(h.date || '')}</span>`).join('')}</div></div>` : '';
        document.getElementById('modalData').innerHTML = `<button class="modal-close-pin" onclick="document.getElementById('detailModal').style.display='none';history.replaceState(null,'',window.location.pathname+window.location.search)"><i class="fas fa-times"></i></button><button class="modal-close-pin" onclick="copyDemonLink()" style="right:56px;background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.3);color:#60a5fa;" id="shareDemonBtn"><i class="fas fa-link"></i></button>${idx>0 ? `<button onclick="showInfoByKey('${list[idx-1].key}','impossible')" style="position:absolute;top:50%;left:-16px;transform:translateY(-50%);background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.25);color:var(--accent);width:32px;height:32px;border-radius:50%;cursor:pointer;"><i class="fas fa-chevron-left"></i></button>` : ''}${idx<list.length-1 ? `<button onclick="showInfoByKey('${list[idx+1].key}','impossible')" style="position:absolute;top:50%;right:-16px;transform:translateY(-50%);background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.25);color:var(--accent);width:32px;height:32px;border-radius:50%;cursor:pointer;"><i class="fas fa-chevron-right"></i></button>` : ''}<div style="text-align:center;margin:0 44px 16px 0;"><div style="display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;"><span style="background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.22);color:#f87171;font-family:'Orbitron';font-weight:900;font-size:.8rem;padding:4px 12px;border-radius:8px;">#${idx+1}</span><h2 style="font-family:'Orbitron';font-size:clamp(1.1rem,4vw,1.6rem);font-weight:900;color:#fff;margin:0;">${escapeHtml(d.name || '')}</h2></div><p style="color:#6b7280;font-size:.82rem;margin:6px 0 0;">created by <span style="color:#94a3b8;font-weight:700;">${escapeHtml(d.author || '—')}</span></p></div>${d.vid ? `<div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid rgba(167,139,250,.15);"><iframe style="position:absolute;inset:0;width:100%;height:100%;border:none;" src="https://www.youtube.com/embed/${encodeURIComponent(d.vid)}" allowfullscreen loading="lazy"></iframe></div>` : ''}${d.verifier ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:10px 18px;margin-bottom:16px;"><i class="fas fa-check-circle" style="color:#4ade80;font-size:1rem;"></i><span style="font-size:.88rem;color:#86efac;">${currentLang === 'EN' ? 'Verified by' : 'Верифицировано'} <b style="color:#4ade80;font-weight:900;">${escapeHtml(d.verifier)}</b></span></div>` : ''}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;"><div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;text-align:center;cursor:pointer;" onclick="copyID('${escapeHtml(d.levelID || '')}')"><div style="font-size:.62rem;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">ID</div><div style="font-family:'Orbitron';font-size:1rem;font-weight:900;color:#fff;">${escapeHtml(d.levelID || '—')}</div></div><div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;text-align:center;"><div style="font-size:.62rem;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">${currentLang === 'EN' ? 'Possible at FPS' : 'Возможен на FPS'}</div><div style="font-family:'Orbitron';font-size:1rem;font-weight:900;color:#60a5fa;">${fpsNum(d) !== null ? fpsNum(d) + ' FPS' : '—'}</div></div></div><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><i class="fas fa-trophy" style="color:#fbbf24;font-size:.9rem;"></i><span style="font-size:.78rem;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1.5px;">${currentLang === 'EN' ? 'Records' : 'Рекорды'}</span><span style="font-size:.72rem;color:#4b5563;">${records.length} total</span></div><div style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;padding-right:4px;">${recordHtml}</div>${historyList}`;
        history.replaceState(null, '', `#impossible/${key}`);
        document.getElementById('detailModal').style.display = 'block';
        document.getElementById('detailModal').scrollTop = 0;
    };

    // Moderator quick panel.
    const originalOpenModQuickPanel = openModQuickPanel;
    openModQuickPanel = function() {
        originalOpenModQuickPanel();
        const typeSel = document.getElementById('mLevelType');
        const option = typeSel?.querySelector('option[value="impossible"]');
        if (option) option.disabled = !canManageImpossible();
        if (typeSel && ![...typeSel.options].some(o => o.value === typeSel.value && !o.disabled)) {
            if (canManageImpossible()) typeSel.value = 'impossible';
        }
        const addBox = document.getElementById('modAddLevelBox');
        if (addBox && canManageImpossible()) addBox.style.display = 'block';
        updateModLevelFormType();
    };

    const originalUpdateModLevelFormType = updateModLevelFormType;
    updateModLevelFormType = function() {
        const type = document.getElementById('mLevelType')?.value;
        const mFpsField = document.getElementById('mFPS');
        if (type !== 'impossible') { if (mFpsField) mFpsField.style.display = 'none'; return originalUpdateModLevelFormType(); }
        if (mFpsField) mFpsField.style.display = 'block';
        const title = document.getElementById('modLevelFormTitle');
        const btnText = document.getElementById('modAddLevelBtnText');
        if (title) { title.textContent = 'Добавить уровень в Impossible List'; title.style.color = '#f87171'; }
        if (btnText) btnText.textContent = 'Добавить Impossible уровень';
        populatePositionSelect('mPosition', 'impossible');
    };

    const originalModAddLevel = modAddLevel;
    modAddLevel = function() {
        const type = document.getElementById('mLevelType')?.value || 'demons';
        if (type !== 'impossible') return originalModAddLevel();
        if (!canManageImpossible()) { showToast('Нет прав на Impossible List'); return; }
        const name = document.getElementById('mName').value.trim();
        if (!name) { showToast('Введи название уровня'); return; }
        const levelID = normalizeLevelID(document.getElementById('mID').value);
        const duplicate = findDuplicateLevelByID(levelID);
        if (duplicate) { showToast(duplicateLevelMessage(duplicate, levelID), 5500); return; }
        
        const index = getInsertIndex('mPosition', impossible());
        const mFpsRaw = (document.getElementById('mFPS')?.value || '').trim();
        const mFpsVal = (mFpsRaw !== '' && !isNaN(parseInt(mFpsRaw, 10))) ? parseInt(mFpsRaw, 10) : null;
        addLevelAtPosition('impossible', {
            name,
            author: document.getElementById('mAuthor').value.trim(),
            levelID,
            tag: document.getElementById('mTag').value.trim(),
            verifier: document.getElementById('mVerifier').value.trim(),
            img: document.getElementById('mImg').value.trim(),
            vid: youtubeId(document.getElementById('mVid').value),
            points: document.getElementById('mPoints').value.trim(),
            fps: mFpsVal
        }, index).then(() => {
            ['mName','mAuthor','mID','mTag','mVerifier','mImg','mVid','mPoints','mFPS'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });

    const originalShowModVictorForm = showModVictorForm;
    showModVictorForm = function(type = 'demon') {
        if (type !== 'impossible') return originalShowModVictorForm(type);
        const form = document.getElementById('modVictorForm');
        const sel = document.getElementById('modVicDemon');
        document.getElementById('modVicType').value = 'impossible';
        const title = document.getElementById('modVictorFormTitle');
        if (title) { title.textContent = 'Рекорд для Impossible List'; title.style.color = '#f87171'; }
        if (sel) sel.innerHTML = impossible().map(d => `<option value="${escapeHtml(d.key)}">${escapeHtml(d.name)}</option>`).join('');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };

    const originalModAddVictor = modAddVictor;
    modAddVictor = function() {
        const type = document.getElementById('modVicType').value || 'demon';
        if (type !== 'impossible') return originalModAddVictor();
        if (!isModerator || (!isAdmin && !currentUserPermissions.canAddRecords)) { showToast('Нет прав на добавление рекордов'); return; }
        const key = document.getElementById('modVicDemon').value;
        const name = document.getElementById('modVicName').value.trim();
        if (!key || !name) { showToast('Выбери уровень и введи ник игрока'); return; }
        db.ref(`impossible/${key}/victors`).push({
            name,
            perc: document.getElementById('modVicPerc').value.trim(),
            att: document.getElementById('modVicAtt').value.trim(),
            vid: youtubeId(document.getElementById('modVicVid').value)
        }).then(() => {
            ['modVicName','modVicPerc','modVicAtt','modVicVid'].forEach(id => document.getElementById(id).value='');
            document.getElementById('modVictorForm').style.display='none';
            document.getElementById('modQuickPanel').style.display='none';
            showToast('Рекорд добавлен');
        }).catch(e => showToast('Ошибка: ' + e.message));
    };

    // Admin panel additions.
    const originalOpenAdmin = openAdmin;
    openAdmin = function() {
        originalOpenAdmin();
        const sel = document.getElementById('admAction');
        if (!sel) return;
        const add = sel.querySelector('option[value="add_impossible"]');
        if (add) { const ok = canManageImpossible(); add.disabled = !ok; add.style.color = ok ? '' : '#555'; }
        const rec = sel.querySelector('option[value="add_victor_impossible"]');
        if (rec) { const ok = isAdmin || !!currentUserPermissions.canAddRecords; rec.disabled = !ok; rec.style.color = ok ? '' : '#555'; }
        const drag = sel.querySelector('option[value="drag_drop"]');
        if (drag && canManageImpossible()) { drag.disabled = false; drag.style.color = ''; }
    };

    const originalToggleAdmFields = toggleAdmFields;
    toggleAdmFields = function() {
        const action = document.getElementById('admAction').value;
        const itemFps = document.getElementById('itemFPS');
        if (!['add_impossible','add_victor_impossible'].includes(action)) {
            const impossibleFields = document.getElementById('fields_victor_impossible');
            if (impossibleFields) impossibleFields.style.display = 'none';
            if (itemFps) itemFps.style.display = 'none';
            return originalToggleAdmFields();
        }
        if (itemFps) itemFps.style.display = action === 'add_impossible' ? 'block' : 'none';
        document.getElementById('fields_main').style.display = action === 'add_impossible' ? 'block' : 'none';
        document.getElementById('fields_demon').style.display = action === 'add_impossible' ? 'block' : 'none';
        document.getElementById('fields_victor').style.display = 'none';
        document.getElementById('fields_victor_challenge').style.display = 'none';
        document.getElementById('fields_victor_impossible').style.display = action === 'add_victor_impossible' ? 'block' : 'none';
        document.getElementById('fields_country').style.display = 'none';
        if (action === 'add_impossible') populatePositionSelect('itemPosition','impossible');
    };

    const originalProcessAdmin = processAdmin;
    processAdmin = function() {
        const action = document.getElementById('admAction').value;
        if (action === 'drag_drop' && isModerator && (isAdmin || currentUserPermissions.canAddDemons || currentUserPermissions.canAddChallenges || currentUserPermissions.canAddImpossible === true)) {
            toggleDragDropMode();
            closeAdmin();
            return;
        }
        if (action === 'add_impossible') {
            if (!canManageImpossible()) { showToast('Нет прав на Impossible List'); return; }
            const name = document.getElementById('itemName').value.trim();
            if (!name) { showToast('Введи название уровня'); return; }
            const levelID = normalizeLevelID(document.getElementById('itemID').value);
            const duplicate = findDuplicateLevelByID(levelID);
            if (duplicate) { showToast(duplicateLevelMessage(duplicate, levelID), 5500); return; }
            const index = getInsertIndex('itemPosition', impossible());
            const iFpsRaw = (document.getElementById('itemFPS')?.value || '').trim();
            const iFpsVal = (iFpsRaw !== '' && !isNaN(parseInt(iFpsRaw, 10))) ? parseInt(iFpsRaw, 10) : null;
            return addLevelAtPosition('impossible', {
                name,
                author: document.getElementById('itemVal').value.trim(),
                levelID,
                tag: document.getElementById('itemTag').value.trim(),
                verifier: document.getElementById('itemVerifier').value.trim(),
                img: document.getElementById('itemImgURL').value.trim(),
                vid: youtubeId(document.getElementById('itemVid').value),
                points: document.getElementById('itemPoints').value.trim(),
                fps: iFpsVal
            }, index).then(() => { showToast(`Impossible уровень добавлен на позицию #${index+1}`); closeAdmin(); }).catch(e => showToast('Ошибка: '+e.message));
        }
        if (action === 'add_victor_impossible') {
            if (!isModerator || (!isAdmin && !currentUserPermissions.canAddRecords)) { showToast('Нет прав на добавление рекордов'); return; }
            const key = document.getElementById('selectImpossible').value;
            const name = document.getElementById('impVicName').value.trim();
            const perc = document.getElementById('impVicPerc').value.trim();
            if (!key || !name || !perc) { showToast('Заполни уровень, ник и проценты'); return; }
            return db.ref(`impossible/${key}/victors`).push({ name, perc, att:document.getElementById('impVicAtt').value.trim(), vid:youtubeId(document.getElementById('impVicVid').value) }).then(() => { showToast('Рекорд добавлен'); closeAdmin(); }).catch(e => showToast('Ошибка: '+e.message));
        }
        return originalProcessAdmin();
    };

    const originalClearPositionHistory = clearPositionHistory;
    clearPositionHistory = function() {
        if (!isAdmin) return originalClearPositionHistory();
        if (!confirm('Очистить историю позиций у всех Demon, Challenge и Impossible уровней?')) return;
        const updates = {};
        demons.forEach(d => updates[`/demons/${d.key}/history`] = null);
        challenges.forEach(d => updates[`/challenges/${d.key}/history`] = null);
        impossible().forEach(d => updates[`/impossible/${d.key}/history`] = null);
        db.ref().update(updates).then(() => { showToast('История позиций очищена'); closeAdmin(); }).catch(e => showToast('Ошибка: '+e.message));
    };

    // Language labels for the added navigation only.
    const originalSetLang = setLang;
    setLang = function(lang) {
        originalSetLang(lang);
        const en = currentLang === 'EN';
        const pairs = {
            navDropImpossibleLabel: 'Impossible Level List',
            mNavImpossible: 'Impossible Level List',
            tabImpossibleLabel: en ? 'Impossible List' : 'Impossible List'
        };
        Object.entries(pairs).forEach(([id,text]) => { const el=document.getElementById(id); if(el) el.textContent=text; });
        if (currentTab === 'impossible') document.getElementById('txtHero').innerText = impossibleLabel();
    };

    // Deep link: #impossible/KEY
    function handleImpossibleHash() {
        const match = window.location.hash.match(/^#impossible\/(.+)$/);
        if (!match) return;
        const key = match[1];
        openSection('listSection');
        setImpossibleTabUi(false);
        const tryOpen = () => {
            if (impossible().some(x => x.key === key)) showInfoByKey(key,'impossible');
        };
        tryOpen();
        setTimeout(tryOpen, 350);
    }
    window.addEventListener('hashchange', handleImpossibleHash);
    window.addEventListener('load', handleImpossibleHash);

    // Realtime listener.
    db.ref('impossible').on('value', snap => {
        const val = snap.val();
        window.impossibleLevels = val ? Object.entries(val).map(([key,d]) => ({ key, ...d, name:fixStr(d.name), creator:fixStr(d.creator) })).sort((a,b)=>(a.order||0)-(b.order||0)) : [];
        const sel = document.getElementById('selectImpossible');
        if (sel) sel.innerHTML = impossible().map(d => `<option value="${escapeHtml(d.key)}">${escapeHtml(d.name)}</option>`).join('');
        if (document.getElementById('mLevelType')?.value === 'impossible') populatePositionSelect('mPosition','impossible');
        if (document.getElementById('admAction')?.value === 'add_impossible') populatePositionSelect('itemPosition','impossible');
        if (currentTab === 'impossible') renderImpossible();
        if (typeof renderRecordModerationList === 'function' && document.getElementById('recordModerationPanel')?.classList.contains('open')) renderRecordModerationList();
        handleImpossibleHash();
    });
})();
