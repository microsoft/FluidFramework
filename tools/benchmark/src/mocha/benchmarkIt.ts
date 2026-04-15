/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";
import { isChildProcess, qualifiedTitle, type BenchmarkOptions } from "../Configuration.js";
import { timer } from "../timer.js";
import { supportParentProcess } from "./runner.js";
import { emitResultsMocha } from "./runnerUtilities.js";

/*
 * Users of this package should be able to author utilities like this for testing tools other than mocha.
 * Therefore, this file should not rely on non-public APIs, except for the mocha specific stuff (like supportParentProcess).
 */

/**
 * If specified, the main process should not run performance tests directly.
 * Instead, a child process will be forked for each test.
 * This has some overhead, but can reduce noise and cross-test effects
 * (e.g. tests performing very differently based on which tests ran before them due to different JIT state).
 * This does not (and cannot) remove all sources of cross-test interference.
 * CPU temperature will still be an issue, so running with fixed CPU clock speeds is still recommended
 * for more precise data.
 *
 * See {@link isChildProcess} to determine if this process is a child under a parent.
 */
const useParentProcess: boolean = process.argv.includes("--parentProcess");

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
		await emitResultsMocha(
			async () =>
				await supportParentProcess(
					test.fullTitle(),
					useParentProcess && !isChildProcess,
					async () => await options.run(timer),
				),
			test,
		);
	});
	return test;
}
