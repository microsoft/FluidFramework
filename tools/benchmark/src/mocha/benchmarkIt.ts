/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";
import { qualifiedTitle, type BenchmarkOptions } from "../Configuration";
import { captureResults } from "../ResultUtilities";
import { timer } from "../timer";
import { supportParentProcessInner } from "./runner";

/**
 * This is a wrapper for Mocha's `it` function which runs the specified benchmark.
 * @remarks
 * Tests created with this function get tagged with '\@Benchmark', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by filtering on that value.
 * @public
 */
export function benchmarkIt(options: BenchmarkOptions): Test {
	const itFunction = options.only === true ? it.only : it;
	const title = qualifiedTitle(options);
	const test = itFunction(title, async () => {
		// Emits the "benchmark end" event with the result
		await supportParentProcessInner(
			test,
			captureResults(async () => await options.run(timer)),
		);
	});
	return test;
}
