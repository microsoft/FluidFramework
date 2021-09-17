/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const packageDir = `${__dirname}/../..`;

const common = require('@fluidframework/mocha-test-setup/mocharc-common.js');
const config = common.getFluidTestMochaConfig(packageDir);
module.exports = config;
