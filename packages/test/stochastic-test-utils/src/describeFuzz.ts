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
		// Stress runs may have tests which are expected to take longer amounts of time.
		// Don't override the timeout if it's already set to a higher value, though.
		switch (args.stressMode) {
			case StressMode.Long: {
				this.timeout(this.timeout() === 0 ? 0 : Math.max(20_000, this.timeout()));

				break;
			}
			case StressMode.Normal:
			case StressMode.Short: {
				this.timeout(this.timeout() === 0 ? 0 : Math.max(10_000, this.timeout()));

				break;
			}
			// No default
		}
		tests.bind(this)(args);
	};
}

/**
 * @internal
 */
export interface StressSuiteArguments {
	/**
	 * Indicates the "stress level" of the tests. The number of test seeds and the timeout threshold
	 * will be adjusted according to the selected mode.
	 */
	stressMode: StressMode;
}

/**
 * @internal
 */
export enum StressMode {
	/**
	 * - Normal Mode: Runs when stress is turned on, also as part of the PR gate.
	 *
	 * Current configuration for each mode:
	 * - Short/Normal Mode: Both run all test seeds with the configured test count, but apply different configurations.
	 * Short mode uses "default" options, while Normal mode uses "stress" options.
	 * - Long Mode: Runs test seeds randomly, with double the original test count and a doubled timeout threshold.
	 */
	Short = "short",
	Normal = "normal",
	Long = "long",
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

	const stressMode = (() => {
		switch (process.env?.FUZZ_STRESS_RUN) {
			case "normal":
				return StressMode.Normal;
			case "long":
				return StressMode.Long;
			case "short":
			default:
				return StressMode.Short;
		}
	})();

	const args = { testCount, stressMode };
	const d: DescribeFuzz = (name, tests) =>
		(stressMode !== StressMode.Short ? describe.only : describe)(
			name,
			createSuite(tests, args),
		);
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
