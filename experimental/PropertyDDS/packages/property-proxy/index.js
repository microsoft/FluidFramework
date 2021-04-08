/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/lib/@fluid-experimental/property-proxy.min.js');
} else {
  module.exports = require('./dist/lib/@fluid-experimental/property-proxy.js');
}
