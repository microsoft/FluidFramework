/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestObjectProvider } from "@fluidframework/test-utils";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from "mocha";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";

function createSkippedTestsWithDriverType(
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) {
	return async function (this: Context) {
		const provider: TestObjectProvider | undefined = this.__fluidTestProvider;
		if (provider === undefined) {
			throw new Error("Expected __fluidTestProvider on this");
		}
		try {
			await test.bind(this)();
		} catch (error) {
			if (skippedDrivers.includes(provider.driver.type)) {
				provider.logger.sendErrorEvent({ eventName: "TestFailedbutSkipped" }, error);
				this.skip();
			} else {
				throw error;
			}
		}
	};
}

export type SkippedTestWithDriverType = (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * Similar to mocha's it function, but allow skipping for some if the error
 * happens on the specific drivers
 */
export const itSkipsOnFailure: SkippedTestWithDriverType = (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test => it(name, createSkippedTestsWithDriverType(skippedDrivers, test));
