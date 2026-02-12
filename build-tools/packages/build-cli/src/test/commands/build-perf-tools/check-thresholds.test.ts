/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import { rimrafSync } from "rimraf";

import type { ProcessedDataOutput } from "../../../library/buildPerf/types.js";

function makeDataFile(overrides: Partial<ProcessedDataOutput> = {}): ProcessedDataOutput {
	return {
		generatedAt: "2024-06-01T12:00:00Z",
		summary: {
			totalBuilds: 100,
			succeeded: 95,
			successRate: 95,
			avgDuration: 85,
		},
		durationTrend: [],
		change3Day: 5,
		change7Day: 3,
		recentBuilds: [],
		longestBuilds: [],
		stagePerformance: [],
		stageTaskBreakdown: {},
		stageDurationTrend: { trendData: [], stageNames: [] },
		taskDurationTrend: { trendData: [], taskNames: [] },
		...overrides,
	};
}

describe("flub build-perf-tools check-thresholds", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = path.join(tmpdir(), `build-perf-check-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rimrafSync(tempDir);
	});

	it("passes when thresholds are not exceeded", async () => {
		const data = makeDataFile({
			summary: { totalBuilds: 100, succeeded: 95, successRate: 95, avgDuration: 85 },
		});
		writeFileSync(path.join(tempDir, "public-data.json"), JSON.stringify(data));

		await runCommand(
			[
				"build-perf-tools:check-thresholds",
				"--mode",
				"public",
				"--inputDir",
				tempDir,
				"--avgDurationThreshold",
				"90",
				"--changePeriodThreshold",
				"15",
				"--quiet",
			],
			{ root: import.meta.url },
		);

		// Command should not throw (exit code 0)
		// stdout will be empty due to --quiet
	});

	it("fails when average duration exceeds threshold", async () => {
		const data = makeDataFile({
			summary: { totalBuilds: 100, succeeded: 95, successRate: 95, avgDuration: 95 },
		});
		writeFileSync(path.join(tempDir, "public-data.json"), JSON.stringify(data));

		const { error } = await runCommand(
			[
				"build-perf-tools:check-thresholds",
				"--mode",
				"public",
				"--inputDir",
				tempDir,
				"--avgDurationThreshold",
				"90",
				"--changePeriodThreshold",
				"15",
			],
			{ root: import.meta.url },
		);

		expect(error).to.not.be.undefined;
		expect(error?.message).to.include("Thresholds exceeded");
	});

	it("fails when period change exceeds threshold", async () => {
		const data = makeDataFile({ change3Day: 20 });
		writeFileSync(path.join(tempDir, "public-data.json"), JSON.stringify(data));

		const { error } = await runCommand(
			[
				"build-perf-tools:check-thresholds",
				"--mode",
				"public",
				"--inputDir",
				tempDir,
				"--avgDurationThreshold",
				"90",
				"--changePeriodThreshold",
				"15",
			],
			{ root: import.meta.url },
		);

		expect(error).to.not.be.undefined;
		expect(error?.message).to.include("Thresholds exceeded");
	});

	it("fails when forceFailure is set", async () => {
		const data = makeDataFile();
		writeFileSync(path.join(tempDir, "public-data.json"), JSON.stringify(data));

		const { error } = await runCommand(
			[
				"build-perf-tools:check-thresholds",
				"--mode",
				"public",
				"--inputDir",
				tempDir,
				"--avgDurationThreshold",
				"90",
				"--changePeriodThreshold",
				"15",
				"--forceFailure",
			],
			{ root: import.meta.url },
		);

		expect(error).to.not.be.undefined;
		expect(error?.message).to.include("Thresholds exceeded");
	});

	it("uses correct data file for internal mode", async () => {
		const data = makeDataFile({ change7Day: 2 });
		writeFileSync(path.join(tempDir, "internal-data.json"), JSON.stringify(data));

		const { error } = await runCommand(
			[
				"build-perf-tools:check-thresholds",
				"--mode",
				"internal",
				"--inputDir",
				tempDir,
				"--avgDurationThreshold",
				"90",
				"--changePeriodThreshold",
				"15",
				"--quiet",
			],
			{ root: import.meta.url },
		);

		// Should pass - no error
		expect(error).to.be.undefined;
	});
});
