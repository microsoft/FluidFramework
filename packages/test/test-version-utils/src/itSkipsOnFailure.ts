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
export type skippedTestWithDriver = SkippedTestWithDriverType & {
	/**
	 * Like Mocha's `it.skip`, but for the driver tests.
	 */
	only: SkippedTestWithDriverType;

	/**
	 * Like Mocha's `it.skip`, but for the driver tests.
	 */
	skip: SkippedTestWithDriverType;
};

function createSkippedTestWithDriver(): skippedTestWithDriver {
	const skippedTestWithDriver: skippedTestWithDriver = (
		name: string,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) => it(name, createSkippedTestsWithDriverType(skippedDrivers, test));

	skippedTestWithDriver.only = (
		name: string,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) => it.only(name, createSkippedTestsWithDriverType(skippedDrivers, test));

	skippedTestWithDriver.skip = (
		name: string,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) => it.skip(name, createSkippedTestsWithDriverType(skippedDrivers, test));

	return skippedTestWithDriver;
}

/**
 * Similar to mocha's `it` function, but allow skipping for some if the error
 * happens on the specific drivers.
 *
 * @internal
 */
export const itSkipsFailureOnSpecificDrivers: skippedTestWithDriver =
	createSkippedTestWithDriver();

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
 * @internal
 */
export type skippedErrorExpectingTestWithDriver = SkippedErrorExpectingTestWithDriverType & {
	/**
	 * Like Mocha's `it.only`, but for the driver tests.
	 */
	only: SkippedErrorExpectingTestWithDriverType;

	/**
	 * Like Mocha's `it.skip`, but for the driver tests.
	 */
	skip: SkippedErrorExpectingTestWithDriverType;
};

function createSkippedErrorExpectingTestWithDriver(): skippedErrorExpectingTestWithDriver {
	const skippedErrorExpectingTestWithDriver: skippedErrorExpectingTestWithDriver = (
		name: string,
		orderedExpectedEvents: ExpectedEvents,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) =>
		it(
			name,
			createSkippedTestsWithDriverType(
				skippedDrivers,
				createExpectsTest(orderedExpectedEvents, test),
			),
		);

	skippedErrorExpectingTestWithDriver.only = (
		name: string,
		orderedExpectedEvents: ExpectedEvents,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) =>
		it.only(
			name,
			createSkippedTestsWithDriverType(
				skippedDrivers,
				createExpectsTest(orderedExpectedEvents, test),
			),
		);

	skippedErrorExpectingTestWithDriver.skip = (
		name: string,
		orderedExpectedEvents: ExpectedEvents,
		skippedDrivers: TestDriverTypes[],
		test: Mocha.AsyncFunc,
	) =>
		it.skip(
			name,
			createSkippedTestsWithDriverType(
				skippedDrivers,
				createExpectsTest(orderedExpectedEvents, test),
			),
		);

	return skippedErrorExpectingTestWithDriver;
}

/**
 * Similar to the `itExpects` function, but allow skipping for some if the error
 * happens on the specific drivers.
 *
 * @internal
 */
export const itExpectsSkipsFailureOnSpecificDrivers: skippedErrorExpectingTestWithDriver =
	createSkippedErrorExpectingTestWithDriver();
