/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestObjectProvider, timeoutAwait } from "@fluidframework/test-utils";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from "mocha";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ExpectedEvents, createExpectsTest } from "./itExpects.js";

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
			await timeoutAwait(test.bind(this)());
		} catch (error) {
			if (skippedDrivers.includes(provider.driver.type)) {
				createChildLogger({ logger: provider.logger }).sendErrorEvent(
					{ eventName: "TestFailedbutSkipped" },
					error,
				);
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

export type SkippedErrorExpectingTestWithDriverType = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * Similar to mocha's it function, but allow skipping for some if the error
 * happens on the specific drivers
 */
export const itSkipsFailureOnSpecificDrivers: SkippedTestWithDriverType = (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test => it(name, createSkippedTestsWithDriverType(skippedDrivers, test));

/**
 * Similar to the ItExpects function, but allow skipping for some if the error
 * happens on the specific drivers
 */
export const itExpectsSkipsFailureOnSpecificDrivers: SkippedErrorExpectingTestWithDriverType = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test =>
	it(
		name,
		createSkippedTestsWithDriverType(
			skippedDrivers,
			createExpectsTest(orderedExpectedEvents, test),
		),
	);
