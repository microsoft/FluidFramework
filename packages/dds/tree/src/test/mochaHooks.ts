/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { emulateProductionBuild } from "@fluidframework/core-utils/internal";

/*
 * This file has top level mocha hooks which should be applied to all tests in this package.
 * This file should always be loaded when running tests in this package.
 *
 * If manually running subsets of tests by file (rather than filtering), this file should be explicitly included.
 * Note however that such an approach to limit which tests run is not recommended: use what is specified in this package's mocha config instead,
 * and augment that with test filters.
 */

/**
 * Allow running test with development-only logic (e.g. `debugAssert`) disabled.
 * @remarks
 * Ideally testing for production style use would be done by producing an actual production bundle and testing that,
 * but configuring that is more difficult and this is a useful approximation for now.
 *
 * Currently this configuration is not run automatically.
 * As this currently only disables debugAsserts and development-only assert messages, the chances of regressions are low.
 * Currently it's considered better to spend the testing time on running more fuzz tests.
 * Some test suites where regressions are more likely do their own testing with and without `emulateProductionBuild`,
 * further reducing the need to run this configuration regularly.
 */
const emulateProduction = process.argv.includes("--emulateProduction");

if (emulateProduction) {
	before(() => {
		emulateProductionBuild();
	});
	after(() => {
		emulateProductionBuild(false);
	});
}
