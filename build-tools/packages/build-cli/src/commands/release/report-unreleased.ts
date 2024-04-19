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
		`Creates a release report for each build of the client release group published to an internal ADO feed. It creates a report using the version set in the pipeline run. The report is a combination of the "simple" and "caret" report formats. Packages released as part of the client release group will have an exact version range, while other packages, such as server packages or independent packages, will have a caret-equivalent version range.`;

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
				this.logger,
			);
			this.log("Files processed successfully.");
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

	log?.log(`Caret manifest file name: ${caretJsonFile}`);
	log?.log(`Simple manifest file name: ${simpleJsonFile}`);

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
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);
	try {
		const manifestData = await fs.readFile(`${path}/${jsonFile}`, "utf8");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const manifestFile: PackageVersionList = JSON.parse(manifestData);

		for (const key of Object.keys(manifestFile)) {
			if (ignorePackageList.has(key)) {
				continue;
			}

			if (
				isInternalVersionRange(manifestFile[key], true) ||
				manifestFile[key].includes("-rc.")
			) {
				manifestFile[key] = devVersion;
			}
		}

		const currentDate = new Date().toISOString().slice(0, 10);

		const versionParts: string[] = devVersion.split(".");

		// Extract the last part of the version, which is the number you're looking for
		const buildNumber: number = Number.parseInt(versionParts[versionParts.length - 1], 10);

		log?.log(`Build Number: ${buildNumber}`);

		await fs.writeFile(`${path}/${jsonFile}`, JSON.stringify(manifestFile, undefined, 2));
		await fs.copyFile(`${path}/${jsonFile}`, `${path}/${revisedFileName}-${currentDate}.json`);
		await fs.copyFile(`${path}/${jsonFile}`, `${path}/${revisedFileName}-${buildNumber}.json`);
	} catch (error) {
		log?.errorLog("Error writing manifest to file:", error);
		return undefined;
	}
}
