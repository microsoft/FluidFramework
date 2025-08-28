/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = `${__dirname}/../..`;
const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);
// These tests need to be run with two different test file filters due to some needing multiprocess/childClient.ts and some crashing if they include it.
// As this is a rather different setup, it's simplest to just let the individual scripts specify what they need and disable the default.
delete config.spec;
module.exports = config;
