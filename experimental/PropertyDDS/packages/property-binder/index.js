/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/lib/@adsk/forge-appfw-databinder.min.js');
} else {
  module.exports = require('./dist/lib/@adsk/forge-appfw-databinder.js');
}
