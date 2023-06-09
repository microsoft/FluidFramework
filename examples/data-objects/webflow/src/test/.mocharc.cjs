/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = `${__dirname}/../..`;

const getFluidTestMochaConfig = require("@fluid-internal/test-version-utils/mocharc-common.cjs");
const config = getFluidTestMochaConfig(packageDir);
module.exports = config;
