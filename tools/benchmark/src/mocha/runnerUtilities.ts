/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";

import type { BenchmarkResult } from "../ResultTypes";

/**
 * Executes a function, emits the results to a mocha test, and throws any exception.
 * This handles mocha-specific result emission.
 */
export async function emitResultsMocha(
	f: () => Promise<{ result: BenchmarkResult; exception?: Error }>,
	test: Test,
): Promise<void> {
	const { exception, result } = await f();
	test.emit("benchmark end", result);
	if (exception !== undefined) {
		throw exception;
	}
}
