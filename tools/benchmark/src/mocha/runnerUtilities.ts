/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";

import { isResultError, type BenchmarkResult } from "../reportTypes.js";
import { isInPerformanceTestingMode } from "../Configuration.js";

/**
 * Executes a function, emits the results to a mocha test, and throws any errors.
 * @remarks
 * This handles mocha-specific result emission and ensures the test fails if there is an error.
 */
export async function emitResultsMocha(
	f: () => Promise<{ result: BenchmarkResult; exception?: Error }>,
	test: Test,
): Promise<void> {
	const { exception, result } = await f();
	// Only emit results in perfMode
	if (isInPerformanceTestingMode) {
		test.emit("benchmark end", result);
		// If test is running in parallel mode, the reporter cannot subscribe to events on tests.
		// It can however access the test body, so cramming the results in there makes them usable on the reporter side.
		// Normally the "body" contains the source code of the test, but we don't need that for anything, so its fine to overwrite it with the results.
		// See reference to "emitResultsMocha" in Reporter.ts for how the reporter uses this data.
		// TODO: Once we are on the latest version of mocha, we should look for a better solution, and if none is found,
		// we can report an issue with Mocha upstream as directed by their documentation,
		// see https://mochajs.org/features/parallel-mode/#limited-reporter-api-for-third-party-reporters
		test.body = JSON.stringify(result);
	}
	if (exception !== undefined) {
		throw exception;
	}
	if (isResultError(result)) {
		throw new Error(result.error);
	}
}
