/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = `${__dirname}/../..`;
const {
	getFluidTestMochaConfigWithCompat,
} = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfigWithCompat(packageDir);
module.exports = config;
