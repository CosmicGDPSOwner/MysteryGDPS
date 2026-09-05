(() => {
    'use strict';

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить ' + src));
            document.body.appendChild(script);
        });
    }

    async function boot() {
        try {
            if (window.NightAccessGate) {
                await window.NightAccessGate.waitForAccess();
            }

            await loadScript('./assets/js/app-core.js');
            await loadScript('./assets/js/accounts-records.js?v=identity-staff-fix-2');
            await loadScript('./assets/js/staff-identity-click-fix.js?v=staff-identity-fix-2');
            await loadScript('./assets/js/account-country.js?v=country-profile-1');
            await loadScript('./assets/js/account-public-id.js?v=account-id-1');
            await loadScript('./assets/js/identity-account-id-limit.js?v=id-limit-10000-1');
            await loadScript('./assets/js/record-delete-permission.js');
            await loadScript('./assets/js/impossible-list.js?v=fps-1');
            await loadScript('./assets/js/moderator-level-write-fix.js?v=mod-level-write-2');
            await loadScript('./assets/js/profile-relink-admin-rename.js?v=relink-rename-1');
            await loadScript('./assets/js/verification-status.js?v=20260826-3');

            if (document.readyState !== 'loading') {
                document.dispatchEvent(new Event('DOMContentLoaded'));
            }
            if (document.readyState === 'complete') {
                window.dispatchEvent(new Event('load'));
            }
        } catch (error) {
            console.error('[Night GDPS] boot failed:', error);
            const status = document.getElementById('nightAccessStatus');
            const gate = document.getElementById('nightAccessGate');
            if (gate) gate.hidden = false;
            document.documentElement.classList.add('night-access-locked');
            if (status) {
                status.textContent = 'Не удалось запустить сайт. Обновите страницу или обратитесь к администрации.';
                status.classList.add('error');
            }
        }
    }

    boot();
})();
