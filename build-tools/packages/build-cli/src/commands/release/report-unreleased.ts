/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { isInternalVersionRange } from "@fluid-tools/version-tools";
import type { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import type { PackageVersionList } from "../../library";

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly description =
		`This command creates a release report for each build of the client release group published to an internal ADO feed. It utilizes the version set in the pipeline run to generate reports in the "simple" and "caret" formats. This command is used within the "upload-dev-manifest" yaml file and currently operates exclusively for non-PR main branch builds.`;

	static readonly flags = {
		version: Flags.string({
			description:
				"Version to generate a report for. Typically, this version is the version of a dev build.",
			required: true,
		}),
		outDir: Flags.directory({
			description: "Release report output directory",
			required: true,
			char: "o",
		}),
		caretManifestFilePath: Flags.string({
			description: "Specify the path to the caret manifest file",
			char: "c",
			default: ".",
		}),
		simpleManifestFilePath: Flags.string({
			description: "Specify the path to the simple manifest file",
			char: "s",
			default: ".",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		const [caretManifestFilePath, simpleManifestFilePath] = await Promise.all([
			fs.readdir(flags.caretManifestFilePath),
			fs.readdir(flags.simpleManifestFilePath),
		]);

		const caretJsonFilePath = caretManifestFilePath.find((file) =>
			file.endsWith(".caret.json"),
		);
		const simpleJsonFilePath = simpleManifestFilePath.find((file) =>
			file.endsWith(".simple.json"),
		);

		if (caretJsonFilePath === undefined || simpleJsonFilePath === undefined) {
			this.errorLog(
				`Either *.caret.json or *.simple.json file doesn't exist: ${caretJsonFilePath} and ${simpleJsonFilePath}`,
			);
			this.exit();
		}

		this.log(`Caret manifest file name: ${caretJsonFilePath}`);
		this.log(`Simple manifest file name: ${simpleJsonFilePath}`);

		try {
			await generateReleaseReportForUnreleasedVersions(
				path.join(flags.caretManifestFilePath, caretJsonFilePath),
				path.join(flags.simpleManifestFilePath, simpleJsonFilePath),
				flags.version,
				flags.outDir,
				this.logger,
			);
			this.log("Files processed successfully.");
		} catch (error: unknown) {
			this.error(`Unable to process manifest files: ${error}`);
		}
	}
}

/**
 * Generates release reports for unreleased versions based on specified manifest files.
 * @param caretManifestFilePath - The path to the caret manifest file.
 * @param simpleManifestFilePath - The path to the simple manifest file.
 * @param version - The version string for the reports.
 * @param outDir - The output directory for the reports.
 * @param logger - The logger object for logging messages.
 */
async function generateReleaseReportForUnreleasedVersions(
	caretManifestFilePath: string,
	simpleManifestFilePath: string,
	version: string,
	outDir: string,
	log: Logger,
): Promise<void> {
	if (caretManifestFilePath) {
		await writeManifestToFile(outDir, caretManifestFilePath, "manifest", version, log);
	}

	if (simpleManifestFilePath) {
		await writeManifestToFile(outDir, simpleManifestFilePath, "simpleManifest", version, log);
	}
}

/**
 * Writes a modified manifest file to the output directory with the revised file name.
 * @param outDir - The output directory for the manifest file.
 * @param manifestFilePath - The path to the original manifest file.
 * @param revisedFileName - The revised file name for the manifest file.
 * @param version - The version string to update packages to.
 * @param logger - The logger object for logging messages.
 */
async function writeManifestToFile(
	outDir: string,
	manifestFilePath: string,
	revisedFileName: string,
	version: string,
	log: Logger,
): Promise<string | void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);
	try {
		const manifestData = await fs.readFile(manifestFilePath, "utf8");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const jsonData: PackageVersionList = JSON.parse(manifestData);

		await updateManifestVersions(jsonData, ignorePackageList, version);

		const currentDate = new Date().toISOString().slice(0, 10);

		const buildNumber = extractBuildNumber(version);

		log.log(`Build Number: ${buildNumber}`);

		const revisedFilePathCurrentDate = path.join(
			outDir,
			`${revisedFileName}-${currentDate}.json`,
		);
		const revisedFilePathBuildNumber = path.join(
			outDir,
			`${revisedFileName}-${buildNumber}.json`,
		);

		await Promise.all([
			fs.writeFile(manifestFilePath, JSON.stringify(jsonData, undefined, 2)),
			fs.writeFile(revisedFilePathCurrentDate, JSON.stringify(jsonData, undefined, 2)),
			fs.writeFile(revisedFilePathBuildNumber, JSON.stringify(jsonData, undefined, 2)),
		]);
	} catch (error) {
		log.errorLog("Error writing manifest to file:", error);
	}
}

/**
 * Updates versions in a manifest file based on specified conditions.
 * @param manifestFile - The manifest file object containing package names and versions.
 * @param ignorePackageList - The set of package names to ignore during version updating.
 * @param version - The version string to update packages to.
 */
async function updateManifestVersions(
	manifestFile: Record<string, string>,
	ignorePackageList: Set<string>,
	version: string,
): Promise<void> {
	for (const packageName of Object.keys(manifestFile)) {
		if (ignorePackageList.has(packageName)) {
			continue;
		}

		if (
			isInternalVersionRange(manifestFile[packageName], true) ||
			manifestFile[packageName].includes("-rc.")
		) {
			manifestFile[packageName] = version;
		}
	}
}

/**
 * Extracts the build number from a version string.
 *
 * @param version - The version string containing the build number.
 * @returns The extracted build number.
 *
 * @example
 * Returns 260312
 * extractBuildNumber("2.0.0-dev-rc.4.0.0.260312");
 */

function extractBuildNumber(version: string): number {
	const versionParts: string[] = version.split(".");
	// Extract the last part of the version, which is the number you're looking for
	return Number.parseInt(versionParts[versionParts.length - 1], 10);
}
