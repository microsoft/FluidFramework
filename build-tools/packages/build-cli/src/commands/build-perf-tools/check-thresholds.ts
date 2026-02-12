/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import type {
	BuildPerfMode,
	ProcessedDataOutput,
	ThresholdResult,
} from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/index.js";

/**
 * Check build performance thresholds and fail if exceeded.
 * Reads pre-computed metrics from a data JSON file and compares against configurable thresholds.
 */
export default class BuildPerfCheckCommand extends BaseCommand<typeof BuildPerfCheckCommand> {
	static readonly description = "Check build performance thresholds and fail if exceeded.";

	static readonly flags = {
		mode: Flags.string({
			description: 'Pipeline mode: "public" (PR builds) or "internal".',
			env: "MODE",
			required: true,
			options: ["public", "internal"],
		}),
		inputDir: Flags.directory({
			description: "Directory containing the data JSON files.",
			env: "INPUT_DIR",
			required: true,
		}),
		avgDurationThreshold: Flags.integer({
			description: "Maximum acceptable average build duration in minutes.",
			env: "AVG_DURATION_THRESHOLD",
			required: true,
		}),
		changePeriodThreshold: Flags.integer({
			description:
				"Maximum acceptable percentage change over the relevant period (3 days for public, 7 days for internal).",
			env: "CHANGE_PERIOD_THRESHOLD",
			required: true,
		}),
		forceFailure: Flags.boolean({
			description: "Force a failure (for testing notifications).",
			env: "FORCE_FAILURE",
			default: false,
		}),
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Check thresholds for public (PR) builds.",
			command:
				"<%= config.bin %> <%= command.id %> --mode public --inputDir ./data --avgDurationThreshold 90 --changePeriodThreshold 15",
		},
	];

	public async run(): Promise<ThresholdResult> {
		const { flags } = this;
		const mode = flags.mode as BuildPerfMode;

		const dataFile =
			mode === "public"
				? path.join(flags.inputDir, "public-data.json")
				: path.join(flags.inputDir, "internal-data.json");
		const changePeriodDays = mode === "public" ? 3 : 7;
		const changeField = mode === "public" ? "change3Day" : "change7Day";

		this.log("==========================================");
		this.log(`Checking build performance thresholds (${mode} mode)`);
		this.log("==========================================");
		this.log(`Data file: ${dataFile}`);
		this.log("Thresholds:");
		this.log(`  Average duration: ${flags.avgDurationThreshold} minutes`);
		this.log(`  ${changePeriodDays}-day change: \u00B1${flags.changePeriodThreshold}%`);

		if (flags.forceFailure) {
			this.log("");
			this.log("** FORCE_FAILURE is enabled - will fail regardless of thresholds **");
		}

		// Read the data file
		let data: ProcessedDataOutput;
		try {
			data = JSON.parse(readFileSync(dataFile, "utf8")) as ProcessedDataOutput;
		} catch (err) {
			this.error(`Failed to read data file '${dataFile}': ${err}`);
		}

		const avgDuration = data.summary.avgDuration;
		const changePeriod = data[changeField] as number;

		if (avgDuration === undefined || avgDuration === null) {
			this.warning("Could not extract avgDuration from data file");
			return { passed: true, alertReasons: [], avgDuration: 0, changePeriod: 0 };
		}

		if (changePeriod === undefined || changePeriod === null) {
			this.warning(`Could not extract ${changeField} from data file`);
			return {
				passed: true,
				alertReasons: [],
				avgDuration,
				changePeriod: 0,
			};
		}

		this.log("");
		this.log("Key metrics:");
		this.log(`  Average duration: ${avgDuration} minutes`);
		this.log(`  ${changePeriodDays}-day change: ${changePeriod}%`);

		// Check thresholds
		const alertReasons: string[] = [];

		if (avgDuration > flags.avgDurationThreshold) {
			alertReasons.push(
				`Average build duration (${avgDuration} min) exceeds threshold (${flags.avgDurationThreshold} min)`,
			);
		}

		const changePeriodAbs = Math.abs(changePeriod);
		if (changePeriodAbs > flags.changePeriodThreshold) {
			alertReasons.push(
				`${changePeriodDays}-day build duration change (${changePeriod}%) exceeds threshold (\u00B1${flags.changePeriodThreshold}%)`,
			);
		}

		if (flags.forceFailure) {
			alertReasons.push("Forced failure for testing notifications");
		}

		this.log("");
		this.log("==========================================");

		const result: ThresholdResult = {
			passed: alertReasons.length === 0,
			alertReasons,
			avgDuration,
			changePeriod,
		};

		if (!result.passed) {
			this.log("ALERT: Thresholds exceeded:");
			for (const reason of alertReasons) {
				this.log(`  - ${reason}`);
			}
			this.log("");
			this.log("Key metrics:");
			this.log(`  - Average Duration: ${avgDuration} minutes`);
			this.log(`  - ${changePeriodDays}-day Change: ${changePeriod}%`);
			this.log("==========================================");
			this.log("");
			this.error("Thresholds exceeded - failing pipeline to trigger notifications.");
		} else {
			this.log("All thresholds within acceptable limits");
			this.log("==========================================");
		}

		return result;
	}
}
