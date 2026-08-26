(() => {
    'use strict';

    // Keep the original application code untouched and load small extensions
    // immediately after it. This file is executed while index.html parses.
    document.write(
        '<script src="./assets/js/app-core.js"></script>' +
        '<script src="./assets/js/record-delete-permission.js"></script>' +
        '<script src="./assets/js/verification-status.js?v=20260826-3"></script>'
    );
})();
