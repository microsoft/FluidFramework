/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import { fetchBuilds, fetchTimelines } from "../../library/buildPerf/adoClient.js";
import { processRawData } from "../../library/buildPerf/processData.js";
import type { BuildPerfMode } from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Collect build performance data from Azure DevOps and generate processed metrics.
 * Fetches build records and timeline data via the ADO SDK, then processes
 * everything into aggregated metrics written as a single JSON file.
 */
export default class BuildPerfCollectCommand extends BaseCommand<
	typeof BuildPerfCollectCommand
> {
	static readonly description =
		"Collect build performance data from Azure DevOps and generate processed metrics.";

	static readonly flags = {
		adoApiToken: Flags.string({
			description: "Azure DevOps API token for authentication.",
			env: "ADO_API_TOKEN",
			required: true,
		}),
		org: Flags.string({
			description: "Azure DevOps organization name.",
			env: "ORG",
			default: "fluidframework",
		}),
		project: Flags.string({
			description: "Azure DevOps project name.",
			env: "PROJECT",
			required: true,
		}),
		mode: Flags.string({
			description: 'Pipeline mode: "public" (PR builds) or "internal".',
			env: "MODE",
			required: true,
			options: ["public", "internal"],
		}),
		buildCount: Flags.integer({
			description: "Number of builds to fetch.",
			env: "BUILD_COUNT",
			default: 500,
		}),
		prBuildDefId: Flags.integer({
			description: "Build definition ID for PR builds (required for public mode).",
			env: "PR_BUILD_DEF_ID",
		}),
		internalBuildDefId: Flags.integer({
			description: "Build definition ID for internal builds (required for internal mode).",
			env: "INTERNAL_BUILD_DEF_ID",
		}),
		parallelJobs: Flags.integer({
			description: "Number of concurrent API requests for timeline fetching.",
			env: "PARALLEL_JOBS",
			default: 20,
		}),
		outputDir: Flags.directory({
			description: "Directory to write output files to.",
			env: "OUTPUT_DIR",
			required: true,
		}),
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Collect public (PR) build data.",
			command:
				"<%= config.bin %> <%= command.id %> --mode public --project public --prBuildDefId 11 --outputDir ./output --adoApiToken $ADO_TOKEN",
		},
	];

	public async run(): Promise<void> {
		const { flags } = this;
		// oclif validates --mode against the options array, so the cast is safe.
		const mode = flags.mode as BuildPerfMode;

		this.logHr();
		this.log(`Collecting build performance data (${mode} mode)`);
		this.logHr();
		this.log(`Organization: ${flags.org}`);
		this.log(`Project: ${flags.project}`);
		this.log(`Build count: ${flags.buildCount}`);
		this.log("");

		// Ensure output directory exists
		mkdirSync(flags.outputDir, { recursive: true });

		// Step 1: Fetch builds from ADO
		this.log("--- Step 1: Fetching build data ---");
		const builds = await fetchBuilds(
			{
				adoToken: flags.adoApiToken,
				org: flags.org,
				project: flags.project,
				mode,
				buildCount: flags.buildCount,
				prBuildDefId: flags.prBuildDefId,
				internalBuildDefId: flags.internalBuildDefId,
			},
			this.logger,
		);

		if (builds.length === 0) {
			this.warning("No builds found. Generating empty data file.");
		}

		// Step 2: Fetch timeline data in parallel
		this.log("");
		this.log("--- Step 2: Fetching timeline data ---");
		const buildIds = builds.map((b) => b.id);
		const timelines =
			buildIds.length > 0
				? await fetchTimelines(
						{
							adoToken: flags.adoApiToken,
							org: flags.org,
							project: flags.project,
							buildIds,
							parallelJobs: flags.parallelJobs,
						},
						this.logger,
					)
				: {};

		// Step 3: Process data into aggregated metrics
		this.log("");
		this.log("--- Step 3: Processing data ---");
		const generatedAt = new Date().toISOString();
		const processedData = processRawData(builds, timelines, mode, generatedAt, flags.org);

		// Write output
		const outputFile =
			mode === "public"
				? path.join(flags.outputDir, "public-data.json")
				: path.join(flags.outputDir, "internal-data.json");

		const output = JSON.stringify(processedData);
		writeFileSync(outputFile, output);

		this.log(`Data JSON generated: ${outputFile} (${output.length} bytes)`);
		this.log(`Total builds processed: ${processedData.summary.totalBuilds}`);
		this.log(`Average duration: ${processedData.summary.avgDuration.toFixed(1)} minutes`);
	}
}
