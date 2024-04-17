/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import { isInternalVersionRange } from "@fluid-tools/version-tools";
import type { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import type { PackageVersionList } from "../../library";

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly description =
		`Creates a release report for the most recent build of the client release group published to an internal ADO feed. It does this by finding the most recent build in ADO produced from a provided branch, and creates a report using that version. The report is a combination of the "simple" and "caret" report formats. Packages released as part of the client release group will have an exact version range, while other packages, such as server packages or independent packages, will have a caret-equivalent version range.`;

	static readonly flags = {
		devVersion: Flags.string({
			description:
				"Dev version generated in the pipeline. This flag should be provided via the DEV_VERSION environment variable for security reasons.",
			required: true,
			env: "DEV_VERSION",
		}),
		path_to_manifest_file: Flags.string({
			description: "Path to manifest",
			char: "p",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		try {
			await generateReleaseReportForUnreleasedVersions(
				flags.path_to_manifest_file,
				flags.devVersion,
			);
			console.log("Files processed successfully.");
		} catch (error: unknown) {
			this.error(`Unable to process manifest files: ${error}`);
		}
	}
}

async function generateReleaseReportForUnreleasedVersions(
	path: string,
	devVersion: string,
	log?: Logger,
): Promise<void> {
	const files = await fs.readdir(path);

	const caretJsonFile = files.find((file) => file.endsWith(".caret.json"));
	const simpleJsonFile = files.find((file) => file.endsWith(".simple.json"));

	console.log(`Caret manifest file name: ${caretJsonFile}`);
	console.log(`Simple manifest file name: ${simpleJsonFile}`);

	if (caretJsonFile === undefined || simpleJsonFile === undefined) {
		throw new Error(
			`Either *.caret.json or *.simple.json file doesn't exist: ${path} ${caretJsonFile} and ${simpleJsonFile}`,
		);
	}

	if (caretJsonFile) {
		await writeManifestToFile(path, caretJsonFile, "manifest", devVersion, log);
	}

	if (simpleJsonFile) {
		await writeManifestToFile(path, simpleJsonFile, "simpleManifest", devVersion, log);
	}
}

async function writeManifestToFile(
	path: string,
	jsonFile: string,
	revisedFileName: string,
	devVersion: string,
	log?: Logger,
): Promise<string | undefined> {
	try {
		const manifestData = await fs.readFile(`${path}/${jsonFile}`, "utf8");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const manifestFile: PackageVersionList = JSON.parse(manifestData);

		for (const key of Object.keys(manifestFile)) {
			if (
				isInternalVersionRange(manifestFile[key], true) ||
				manifestFile[key].includes("-rc.")
			) {
				manifestFile[key] = devVersion;
			}
		}

		const currentDate = new Date().toISOString().slice(0, 10);

		await fs.writeFile(`${path}/${jsonFile}`, JSON.stringify(manifestFile, undefined, 2));
		await fs.rename(`${path}/${jsonFile}`, `${path}/${revisedFileName}-${currentDate}.json`);
	} catch (error) {
		log?.errorLog("Error writing manifest to file:", error);
		return undefined;
	}
}
