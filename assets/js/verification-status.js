(() => {
    'use strict';

    const style = document.createElement('style');
    style.textContent = `
        /* Verification is metadata, not a promotional badge on every preview. */
        .card-verified-stamp {
            display: none !important;
        }

        .level-verification-status {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
            margin: 0 0 16px;
            border: 1px solid rgba(148, 163, 184, 0.16);
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.36);
        }

        .level-verification-status__label {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: #94a3b8;
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.02em;
        }

        .level-verification-status__value {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .level-verification-status__badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 0.74rem;
            font-weight: 800;
            white-space: nowrap;
        }

        .level-verification-status.is-verified .level-verification-status__badge {
            color: #86efac;
            border: 1px solid rgba(34, 197, 94, 0.24);
            background: rgba(34, 197, 94, 0.08);
        }

        .level-verification-status.is-unverified .level-verification-status__badge {
            color: #cbd5e1;
            border: 1px solid rgba(148, 163, 184, 0.20);
            background: rgba(148, 163, 184, 0.07);
        }

        .level-verification-status__verifier {
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0;
            border: 0;
            background: transparent;
            color: #a7f3d0;
            font: inherit;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
        }

        .level-verification-status__verifier:hover {
            text-decoration: underline;
        }

        @media (max-width: 520px) {
            .level-verification-status {
                align-items: flex-start;
                flex-direction: column;
                gap: 8px;
            }
        }
    `;
    document.head.appendChild(style);

    const findLevel = (key, type) => {
        const list = type === 'challenges' ? challenges : demons;
        return list.find(level => String(level.key) === String(key));
    };

    const removeLegacyVerifiedBanner = (modalData) => {
        Array.from(modalData.children).forEach(child => {
            if (child.classList.contains('level-verification-status')) return;

            const text = (child.textContent || '').trim();
            if (text.startsWith('Verified by') || text.startsWith('Верифицировано')) {
                child.remove();
            }
        });
    };

    const renderVerificationStatus = (level) => {
        const modalData = document.getElementById('modalData');
        if (!modalData || !level) return;

        modalData.querySelector('.level-verification-status')?.remove();
        removeLegacyVerifiedBanner(modalData);

        const verifier = (level.verifier || '').trim();
        const verified = verifier.length > 0;

        const status = document.createElement('div');
        status.className = `level-verification-status ${verified ? 'is-verified' : 'is-unverified'}`;

        const label = document.createElement('div');
        label.className = 'level-verification-status__label';
        label.innerHTML = `<i class="fas fa-shield-alt"></i><span>${currentLang === 'EN' ? 'Verification status' : 'Статус верификации'}</span>`;

        const value = document.createElement('div');
        value.className = 'level-verification-status__value';

        const badge = document.createElement('span');
        badge.className = 'level-verification-status__badge';
        badge.innerHTML = verified
            ? '<i class="fas fa-check-circle"></i><span>Verified</span>'
            : '<i class="far fa-circle"></i><span>Unverified</span>';
        value.appendChild(badge);

        if (verified) {
            const verifierButton = document.createElement('button');
            verifierButton.type = 'button';
            verifierButton.className = 'level-verification-status__verifier';
            verifierButton.textContent = verifier;
            verifierButton.title = verifier;
            verifierButton.addEventListener('click', () => {
                const detailModal = document.getElementById('detailModal');
                if (detailModal) detailModal.style.display = 'none';
                openPlayerProfile(verifier);
            });
            value.appendChild(verifierButton);
        }

        status.append(label, value);

        const header = modalData.firstElementChild;
        if (header) {
            header.insertAdjacentElement('afterend', status);
        } else {
            modalData.prepend(status);
        }
    };

    const originalShowInfoByKey = showInfoByKey;
    showInfoByKey = function(key, type = 'demons') {
        originalShowInfoByKey(key, type);
        renderVerificationStatus(findLevel(key, type));
    };
})();
