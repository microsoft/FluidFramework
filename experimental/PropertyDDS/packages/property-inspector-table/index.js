/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/lib/@fluid-experimental/property-inspector-table.min.js');
} else {
  module.exports = require('./dist/lib/@fluid-experimental/property-inspector-table.js');
}
