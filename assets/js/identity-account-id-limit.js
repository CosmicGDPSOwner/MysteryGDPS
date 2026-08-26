(() => {
    'use strict';

    const MAX_GDPS_ACCOUNT_ID = 10000;

    function validAccountId(raw) {
        const value = String(raw || '').trim();
        if (!/^\d+$/.test(value)) return false;
        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= MAX_GDPS_ACCOUNT_ID && String(number) === value;
    }

    function ensureHint(input) {
        let hint = document.getElementById('identityClaimAccountIdHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'identityClaimAccountIdHint';
            hint.className = 'account-hint';
            input.insertAdjacentElement('afterend', hint);
        }
        return hint;
    }

    function showRangeError(input) {
        const hint = ensureHint(input);
        hint.textContent = 'accountID должен быть числом от 1 до 10000.';
        hint.style.color = '#ff7b7b';
    }

    function bindInput() {
        const input = document.getElementById('identityClaimAccountId');
        if (!input || input.dataset.rangeLimitBound === '1') return;

        input.dataset.rangeLimitBound = '1';
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('min', '1');
        input.setAttribute('max', String(MAX_GDPS_ACCOUNT_ID));
        input.setAttribute('maxlength', '5');

        input.addEventListener('input', () => {
            const raw = String(input.value || '').trim();
            if (!raw) return;

            if (!validAccountId(raw)) {
                // account-public-id.js also updates this hint after its availability check,
                // so repeat our hard range message after that debounce finishes.
                setTimeout(() => {
                    if (String(input.value || '').trim() === raw && !validAccountId(raw)) {
                        showRangeError(input);
                    }
                }, 450);
            }
        });

        input.addEventListener('blur', () => {
            const raw = String(input.value || '').trim();
            if (raw && !validAccountId(raw)) showRangeError(input);
        });
    }

    function blockInvalidSubmission(event) {
        const button = event.target.closest?.('#identityClaimSubmit');
        if (!button) return;

        const input = document.getElementById('identityClaimAccountId');
        const raw = String(input?.value || '').trim();
        if (validAccountId(raw)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (input) showRangeError(input);

        const error = document.getElementById('identityClaimError');
        if (error) error.textContent = 'Night GDPS accountID должен быть числом от 1 до 10000.';
    }

    document.addEventListener('click', blockInvalidSubmission, true);

    const observer = new MutationObserver(bindInput);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    bindInput();
})();
