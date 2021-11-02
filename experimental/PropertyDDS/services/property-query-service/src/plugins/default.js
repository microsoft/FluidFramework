/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');

module.exports = {
  plugins: {
    Authorizer: {
      module: path.join(__dirname,  'Authorizer.js')
    },
    SystemMonitor: {
      module: path.join(__dirname, 'SystemMonitor.js'),
    },
    InstanceMonitor: {
      module: path.join(__dirname, 'InstanceMonitor.js')
    },
    Authenticator: {
      module: path.join(__dirname, 'Authenticator.js')
    }
  }
};
