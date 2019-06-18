/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import ReactTools from 'react-tools';

module.exports = {
    process: function(src) {
        return ReactTools.transform(src, {harmony: true, stripTypes: true});
    }
};
