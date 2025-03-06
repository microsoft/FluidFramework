/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { TestObjectProvider, timeoutAwait } from "@fluidframework/test-utils/internal";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from "mocha";

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

/**
 * @internal
 */
export type SkippedTestWithDriverType = (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * @internal
 */
export type SkippedErrorExpectingTestWithDriverType = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * Similar to mocha's `it` function, but allow skipping for some if the error
 * happens on the specific drivers.
 *
 * @internal
 */
export function itSkipsFailureOnSpecificDrivers(
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it(name, createSkippedTestsWithDriverType(skippedDrivers, test));
}

itSkipsFailureOnSpecificDrivers.only = function (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it.only(name, createSkippedTestsWithDriverType(skippedDrivers, test));
};

itSkipsFailureOnSpecificDrivers.skip = function (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it.skip(name, createSkippedTestsWithDriverType(skippedDrivers, test));
};

/**
 * Similar to the `itExpects` function, but allow skipping for some if the error
 * happens on the specific drivers.
 *
 * @internal
 */
export function itExpectsSkipsFailureOnSpecificDrivers(
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it(
		name,
		createSkippedTestsWithDriverType(
			skippedDrivers,
			createExpectsTest(orderedExpectedEvents, test),
		),
	);
}

itExpectsSkipsFailureOnSpecificDrivers.only = function (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it.only(
		name,
		createSkippedTestsWithDriverType(
			skippedDrivers,
			createExpectsTest(orderedExpectedEvents, test),
		),
	);
};

itExpectsSkipsFailureOnSpecificDrivers.skip = function (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
): Mocha.Test {
	return it.skip(
		name,
		createSkippedTestsWithDriverType(
			skippedDrivers,
			createExpectsTest(orderedExpectedEvents, test),
		),
	);
};
