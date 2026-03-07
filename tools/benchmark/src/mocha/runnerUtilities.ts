/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";

import type { BenchmarkResult } from "../ResultTypes.js";
import { isInPerformanceTestingMode } from "../Configuration.js";

/**
 * Executes a function, emits the results to a mocha test, and throws any exception.
 * This handles mocha-specific result emission.
 */
export async function emitResultsMocha(
	f: () => Promise<{ result: BenchmarkResult; exception?: Error }>,
	test: Test,
): Promise<void> {
	const { exception, result } = await f();
	// Only emit results in perfMode
	if (isInPerformanceTestingMode) {
		test.emit("benchmark end", result);
		// If test is running in parallel mode, the reporter can not subscribe to events on tests.
		// It can however access the test body, so cramming the results in there makes them usable on the reporter side.
		test.body = JSON.stringify(result);
	}
	if (exception !== undefined) {
		throw exception;
	}
}
