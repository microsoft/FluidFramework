/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// This test suite is the slowest on CI if not run in parallel, so this parallelization speeds up CI significantly.
config.parallel = true;
// CI assumes that each package will use one thread when computing how many package's tests to run in parallel.
// To avoid making this computation too inaccurate and slowing things down with excessive memory use
// (and other overhead) from too many threads, we keep the number of jobs limited,
// and only enable this parallelization for packages where doing so actually produces an improvement in CI time.
// 4 jobs was measured to give most of the speed up, even when just running this suite, while not slowing down CI.
config.jobs = 4;
module.exports = config;
