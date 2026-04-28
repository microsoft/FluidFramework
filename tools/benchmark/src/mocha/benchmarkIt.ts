/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";
import {
	BenchmarkMode,
	currentBenchmarkMode,
	isChildProcess,
	qualifiedTitle,
	type BenchmarkOptions,
} from "../Configuration.js";
import { timer } from "../timer.js";
import { supportParentProcess } from "./runner.js";
import { emitResultsMocha } from "./runnerUtilities.js";

/*
 * Users of this package should be able to author utilities like this for testing tools other than mocha.
 * Therefore, this file should not rely on non-public APIs, except for the mocha specific stuff (like supportParentProcess).
 */

/**
 * Options to configure a benchmark test.
 * @remarks
 * See {@link benchmarkIt}.
 *
 * Note that {@link benchmarkIt} returns a Mocha `Test` object.
 * The returned test's timeout (for all modes) can be adjusted after creation via `test.timeout()`.
 * To skip or restrict to `.only`, use the `skip` and `only` options on this interface —
 * Mocha does not support calling those methods on an already-registered test.
 * @public
 * @input
 */
export interface MochaBenchmarkOptions extends BenchmarkOptions {
	/**
	 * When true, `mocha`-provided functions use their `.only` counterparts to restrict the run to this test.
	 */
	readonly only?: boolean;

	/**
	 * The timeout for this test in milliseconds when in {@link BenchmarkMode.Correctness}.
	 * If not specified, the default Mocha timeout will be used.
	 * @remarks
	 * To set a timeout for both modes (correctness and performance), use mocha's built-in
	 * timeout configuration rather than this option, as this option only applies to correctness mode.
	 *
	 * Typically performance tests are run with much longer timeouts than correctness tests,
	 * so this exists to allow extending the runtime for correctness tests without affecting
	 * (likely lowering) the timeout used for performance tests.
	 */
	readonly correctnessTimeoutMs?: number;

	/**
	 * If specified, this test will be skipped.
	 *
	 * When set to `true`, the test is skipped in all modes.
	 * When set to a {@link BenchmarkMode} value, the test is skipped only when running in that mode.
	 * For example, if `skip` is set to {@link BenchmarkMode.Performance}, this test will be skipped
	 * when running in {@link BenchmarkMode.Performance} mode, but will still run in {@link BenchmarkMode.Correctness} mode.
	 */
	readonly skip?: BenchmarkMode | true;
}

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
export function benchmarkIt(options: MochaBenchmarkOptions): Test {
	const title = qualifiedTitle(options);
	let itFunction: Mocha.ExclusiveTestFunction;
	if (options.skip === true || options.skip === currentBenchmarkMode) {
		itFunction = it.skip;
		if (options.only === true) {
			throw new Error(
				`Cannot use both 'skip' and 'only' options on benchmarkIt test ${JSON.stringify(
					title,
				)}`,
			);
		}
	} else if (options.only === true) {
		itFunction = it.only;
	} else {
		itFunction = it;
	}

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
	if (
		currentBenchmarkMode === BenchmarkMode.Correctness &&
		options.correctnessTimeoutMs !== undefined
	) {
		test.timeout(options.correctnessTimeoutMs);
	}
	return test;
}
