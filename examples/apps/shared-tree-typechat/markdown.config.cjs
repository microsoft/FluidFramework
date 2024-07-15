/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    matchWord: 'AUTO-GENERATED-CONTENT',
    transforms: {
        /* Match <!-- AUTO-GENERATED-CONTENT:START (SCRIPTS) --> */
        SCRIPTS: require('markdown-magic-package-scripts'),
    },
    callback: function () {
        console.log('markdown processing done')
    }
}