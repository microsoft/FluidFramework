/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import process from "process";

function createSuite<TArgs extends StressSuiteArguments>(
	tests: (this: Mocha.Suite, args: TArgs) => void,
	args: TArgs,
) {
	return function (this: Mocha.Suite) {
		if (args.isStress) {
			// Stress runs may have tests which are expected to take longer amounts of time.
			// Don't override the timeout if it's already set to a higher value, though.
			this.timeout(this.timeout() === 0 ? 0 : Math.max(10_000, this.timeout()));
		}
		tests.bind(this)(args);
	};
}

/**
 * @internal
 */
export interface StressSuiteArguments {
	/**
	 * Whether the current run is a stress run, which generally runs longer or more programatically generated tests.
	 *
	 * Packages which use this should generally have a `test:stress` script in their package.json for conveniently running
	 * the equivalent checks locally.
	 */
	isStress: boolean;
}

/**
 * @internal
 */
export interface FuzzSuiteArguments extends StressSuiteArguments {
	/**
	 * The number of tests this suite should produce up to a constant factor.
	 * It's up to the suite author to decide which parameters to vary in order to scale up the number of tests.
	 * This parameter can be interpreted liberally by the suite author--e.g. in a suite with 4 "classes" of fuzz
	 * tests due to differences in configuration, running `testCount` tests for each variation (for a total of
	 * `4 * testCount` tests) is fine.
	 */
	testCount: number;
}

/**
 * @internal
 */
export type CreateMochaSuite<TArgs> = (
	name: string,
	createTests: (this: Mocha.Suite, args: TArgs) => void,
) => Mocha.Suite | void;

/**
 * A mocha-like test suite which is also provided some context to its test creation callback.
 * @internal
 */
export type MochaSuiteWithArguments<TArgs> = CreateMochaSuite<TArgs> &
	Record<"skip" | "only", CreateMochaSuite<TArgs>>;

/**
 * @internal
 */
export type DescribeStress = MochaSuiteWithArguments<StressSuiteArguments>;

/**
 * @internal
 */
export type DescribeFuzz = MochaSuiteWithArguments<FuzzSuiteArguments>;

/**
 * @internal
 */
export interface FuzzDescribeOptions {
	defaultTestCount?: number;
}

/**
 * @internal
 */
export const defaultOptions: Required<FuzzDescribeOptions> = {
	defaultTestCount: 1,
};

/**
 * @internal
 */
export function createFuzzDescribe(optionsArg?: FuzzDescribeOptions): DescribeFuzz {
	const options = { ...defaultOptions, ...optionsArg };
	const testCountFromEnv =
		process.env?.FUZZ_TEST_COUNT !== undefined
			? Number.parseInt(process.env.FUZZ_TEST_COUNT, 10)
			: undefined;
	const testCount = testCountFromEnv ?? options.defaultTestCount;
	const isStress =
		process.env?.FUZZ_STRESS_RUN !== undefined && !!process.env?.FUZZ_STRESS_RUN;
	const args = { testCount, isStress };
	const d: DescribeFuzz = (name, tests) =>
		(isStress ? describe.only : describe)(name, createSuite(tests, args));
	d.skip = (name, tests) => describe.skip(name, createSuite(tests, args));
	d.only = (name, tests) => describe.only(name, createSuite(tests, args));
	return d;
}

/**
 * Like `Mocha.describe`, but enables injection of suite size at runtime.
 * The test creation callback receives a `testCount` parameter which it should use to support
 * this functionality.
 *
 * @internal
 */
export const describeFuzz: DescribeFuzz = createFuzzDescribe();

/**
 * Like `Mocha.describe`, but enables detection of whether the current run is a stress run.
 * The test creation callback receives an `isStress` parameter which it should use to support
 * this functionality as it deems fit.
 *
 * @privateRemarks - Reusing `createFuzzDescribe` here means tests will also receive a testCount parameter,
 * but since the typing doesn't include that information it shouldn't be used.
 *
 * @internal
 */
export const describeStress: DescribeStress = createFuzzDescribe();
