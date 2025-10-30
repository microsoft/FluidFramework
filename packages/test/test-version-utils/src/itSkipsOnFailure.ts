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
export type SkippedTestWithDriverBaseType = (
	name: string,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * @internal
 */
export type SkippedTestWithDriverType = SkippedTestWithDriverBaseType & {
	/**
	 * Like Mocha's `it.skip`, but for the driver tests.
	 */
	only: SkippedTestWithDriverBaseType;

	/**
	 * Like Mocha's `it.skip`, but for the driver tests.
	 */
	skip: SkippedTestWithDriverBaseType;
};

function createSkippedTestWithDriver(): SkippedTestWithDriverType {
	const skippedTestWithDriver: SkippedTestWithDriverType = (
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
export const itSkipsFailureOnSpecificDrivers: SkippedTestWithDriverType =
	createSkippedTestWithDriver();

/**
 * @internal
 */
export type SkippedErrorExpectingTestWithDriverBaseType = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	skippedDrivers: TestDriverTypes[],
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * @internal
 */
export type SkippedErrorExpectingTestWithDriverType =
	SkippedErrorExpectingTestWithDriverBaseType & {
		/**
		 * Like Mocha's `it.only`, but for the driver tests.
		 */
		only: SkippedErrorExpectingTestWithDriverBaseType;

		/**
		 * Like Mocha's `it.skip`, but for the driver tests.
		 */
		skip: SkippedErrorExpectingTestWithDriverBaseType;
	};

function createSkippedErrorExpectingTestWithDriver(): SkippedErrorExpectingTestWithDriverType {
	const skippedErrorExpectingTestWithDriver: SkippedErrorExpectingTestWithDriverType = (
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
export const itExpectsSkipsFailureOnSpecificDrivers: SkippedErrorExpectingTestWithDriverType =
	createSkippedErrorExpectingTestWithDriver();
