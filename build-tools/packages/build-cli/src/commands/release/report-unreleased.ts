/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import { isInternalVersionRange } from "@fluid-tools/version-tools";
import { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import fetch from "node-fetch";
import { BaseCommand } from "../../base";
import { PackageVersionList } from "../../library";

// Define the interface for build details
interface IBuildDetails {
	definition: { name: string };
	status: string;
	result: string;
	sourceBranch: string;
	finishTime: string;
	buildNumber: string;
}

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly description =
		`Creates a release report for the most recent build of the client release group published to an internal ADO feed. It does this by finding the most recent build in ADO produced from a provided branch, and creates a report using that version. The report is a combination of the "simple" and "caret" report formats. Packages released as part of the client release group will have an exact version range, while other packages, such as server packages or independent packages, will have a caret-equivalent version range.`;

	static readonly flags = {
		DEV_VERSION: Flags.string({
			description: "Dev version generated in the pipeline. This flag should be provided via the DEV_VERSION environment variable for security reasons.",
			env: "DEV_VERSION",
		}),
		path_to_manifest_file: Flags.string({
			description: "Path to manifest "
		}),
		output: Flags.string({
			description: "Output manifest file path",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {

	}
}

/**
 * Writes a modified manifest to a file.
 * @param manifestFile - The modified manifest file
 * @param output - The path and name of the final manifest file
 * @returns The path to the final manifest file if successful, otherwise undefined
 */
async function writeManifestToFile(
	manifestFile: PackageVersionList,
	output: string,
	log?: Logger,
): Promise<string | undefined> {
	try {
		await fs.writeFile(output, JSON.stringify(manifestFile, undefined, 2));

		log?.log("Manifest modified successfully.", output);

		return output;
	} catch (error) {
		log?.errorLog("Error writing manifest to file:", error);
		return undefined;
	}
}
