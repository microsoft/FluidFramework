/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import childProcess from "node:child_process";

import type { CollectedData } from "../../ResultTypes.js";
import { ValueType } from "../../ResultTypes.js";
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
	function integrationTest(testArgs: string[], shouldFail: boolean): string {
		const args = [...testArgs, "--fgrep", "mocha-integration-inner"];
		if (shouldFail) {
			args.push("--integrationFail");
		}
		const result = childProcess.spawnSync("mocha", args, { encoding: "utf8" });
		assert.equal(result.status, shouldFail ? 1 : 0);
		if (shouldFail) {
			// The error should always make it to the output when failing.
			assert.match(result.stdout, /Example Error/);
		}
		return result.stdout;
	}

	it("correctness", () => {
		const result = integrationTest([], false);
		assert.match(result, /✔ @Benchmark @Measurement mocha-integration-inner\n/);
		assert.match(result, / 1 passing \(/);
	});

	it("correctness with error", () => {
		const result = integrationTest(["--integrationFail"], true);
		assert.match(result, / 0 passing \(/);
	});
	for (const parentProcess of [false, true]) {
		describe(parentProcess ? "with parent process" : "without parent process", () => {
			const args = [...perfModeArgs, ...(parentProcess ? ["--parentProcess"] : [])];
			it("perf", () => {
				const result = integrationTest(args, false);
				// From suite table:
				assert.match(result, /✔\s+mocha-integration-inner\s+1\.000 ms/);
				// From summary table:
				assert.match(result, /✔\s+ \/ mocha integration\s+1 out of 1 /);
			});

			it("perf with error", () => {
				const result = integrationTest([...args, "--integrationFail"], true);
				// From suite table:
				assert.match(result, /×\s+mocha-integration-inner\s+Example Error/);
				// From summary table:
				assert.match(result, /×\s+ \/ mocha integration\s+0 out of 1/);
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
});
