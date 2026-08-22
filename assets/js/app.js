(() => {
    'use strict';

    // Keep the original application code untouched and load the small permission
    // extension immediately after it. This file is executed while index.html parses.
    document.write(
        '<script src="./assets/js/app-core.js"></script>' +
        '<script src="./assets/js/record-delete-permission.js"></script>'
    );
})();
