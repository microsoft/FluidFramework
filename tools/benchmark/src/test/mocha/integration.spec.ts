/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import childProcess from "node:child_process";

import type { CollectedData } from "../../reportTypes.js";
import { ValueType } from "../../reportTypes.js";
import { benchmarkIt } from "../../mocha/index.js";
import { argv } from "node:process";

const sampleResult: CollectedData = [
	{
		name: "duration",
		value: 1,
		units: "ms",
		type: ValueType.SmallerIsBetter,
		significance: "Primary",
	},
];

const perfModeArgs = ["--perfMode", "--reporter", "./dist/mocha/Reporter.js"];

describe("mocha integration", () => {
	function integrationTest(
		testArgs: string[],
		shouldFail: boolean,
		options?: {
			/** Defaults to "mocha-integration-inner". */
			testName?: string;
			env?: NodeJS.ProcessEnv;
		},
	): { stdout: string; stderr: string } {
		// Disable colors with "--no-color" does not seem to work on CI (perhaps due to an environment variable),
		// but enabling colors does seem to work locally, so we enable colors to get consistent results for these tests.
		const testName = options?.testName ?? "mocha-integration-inner";
		const args = [...testArgs, "--fgrep", testName, "--color"];
		const result = childProcess.spawnSync("mocha", args, {
			encoding: "utf8",
			env: { ...process.env, ...options?.env },
		});
		assert.equal(result.status, shouldFail ? 1 : 0);
		return { stdout: result.stdout, stderr: result.stderr };
	}

	it("correctness", () => {
		const { stdout } = integrationTest([], false);
		assert.match(stdout, /✔.*@Benchmark @Measurement mocha-integration-inner/);
		assert.match(stdout, / 1 passing/);
	});

	it("correctness with error", () => {
		const { stdout } = integrationTest(["--integrationFail"], true);
		assert.match(stdout, / 0 passing/);
	});
	for (const parentProcess of [false, true]) {
		describe(parentProcess ? "with parent process" : "without parent process", () => {
			const args = [...perfModeArgs, ...(parentProcess ? ["--parentProcess"] : [])];
			it("perf", () => {
				const { stdout } = integrationTest(args, false);
				// From suite table:
				assert.match(stdout, /✔.+mocha-integration-inner.+1\.000 ms/);
				// From summary table:
				assert.match(stdout, /✔.+mocha integration.+1 out of 1 /);
			});

			it("perf with error", () => {
				const { stdout, stderr } = integrationTest([...args, "--integrationFail"], true, {
					// FLUID_TEST_VERBOSE prevents @fluid-internal/mocha-test-setup from suppressing
					// console.error during test execution, so the error output reaches stderr.
					env: { FLUID_TEST_VERBOSE: "1" },
				});
				// From suite table:
				assert.match(stdout, /×.+mocha-integration-inner.+Example Error/);
				// From summary table:
				assert.match(stdout, /×.+mocha integration.+0 out of 1/);

				// From stderr:
				assert.match(
					stderr,
					/mocha integration \/ @Benchmark @Measurement mocha-integration-inner" failed:/,
				);
				assert.match(stderr, /Example Error/);
			});
		});
	}

	// Test run by integration tests above to validate reporting and such.
	benchmarkIt({
		title: "mocha-integration-inner",
		run: (): CollectedData => {
			if (argv.includes("--integrationFail")) {
				throw new Error("Example Error");
			}
			return sampleResult;
		},
	});

	it("timeout message", () => {
		// Run the timeout inner test (registered only when --integrationTimeout is passed)
		// with a 1ms mocha timeout so it always times out before emitting benchmark data.
		const { stdout, stderr } = integrationTest(
			[
				...perfModeArgs,
				"--integrationTimeout",
				// Without --exit, the 60s sleep in the inner test keeps the subprocess alive long after
				// the mocha timeout fires, hanging this test for a full minute.
				"--exit",
			],
			true,
			{
				testName: "timeout-integration-inner",
				// FLUID_TEST_VERBOSE prevents @fluid-internal/mocha-test-setup from suppressing
				// console.error during test execution, so the timeout error reaches stderr.
				env: { FLUID_TEST_VERBOSE: "1" },
			},
		);

		// The table in stdout and the message in stderr should both have the test name and message:
		assert.match(stderr, /Timeout of 1ms exceeded/);
		assert.match(stdout, /Timeout of 1ms exceeded/);

		assert.match(
			stderr,
			/mocha integration \/ @Benchmark @Measurement timeout-integration-inner" failed:/,
		);
		assert.match(stdout, /mocha integration/);
		assert.match(stdout, /timeout-integration-inner/);
	});

	// Test run by the "timeout message" integration test above.
	// Only registered when --integrationTimeout is passed, to avoid running a deliberately
	// failing test during normal test runs.
	if (argv.includes("--integrationTimeout")) {
		benchmarkIt({
			title: "timeout-integration-inner",
			run: async (): Promise<CollectedData> => {
				// Sleep far longer than the 1ms timeout below so this always times out.
				await new Promise<void>((resolve) => setTimeout(resolve, 60_000));
				return sampleResult;
			},
		}).timeout(1);
	}
});

benchmarkIt({
	title: "top level test",
	run: (): CollectedData => {
		return sampleResult;
	},
});
