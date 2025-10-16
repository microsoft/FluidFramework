/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @fluid-internal/fluid/no-hyphen-after-jsdoc-tag -- false positive */
/**
 * This is a minimal hook set to annotate each test case when run for CommonJS.
 *
 * @see https://mochajs.org/next/features/root-hook-plugins/
 *
 * @remarks Should be kept similar to logic in `@fluid-internal/mocha-test-setup`'s mochaHooks.ts
 */
export const mochaHooks = {
	/* eslint-enable @fluid-internal/fluid/no-hyphen-after-jsdoc-tag */
	beforeEach(this: Mocha.Context): void {
		if (this.currentTest !== undefined && process.env.FLUID_TEST_MODULE_SYSTEM === "CJS") {
			this.currentTest.title = `[CJS] ${this.currentTest.title}`;
		}
	},
};
