/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { isInternalVersionRange, isInternalVersionScheme } from "@fluid-tools/version-tools";
import type { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { formatISO } from "date-fns";
import { writeJson } from "fs-extra";
import { BaseCommand } from "../../base";
import { type PackageVersionList, type ReleaseReport, toReportKind } from "../../library";

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly summary =
		`Creates a release report for an unreleased build (one that is not published to npm), using existing reports in the "simple" and "caret" formats as input.`;

	static readonly description =
		`This command is primarily used to upload reports for non-PR main branch builds so that downstream pipelines can easily consume them.`;

	static readonly flags = {
		version: Flags.string({
			description:
				"Version to generate a report for. Typically, this version is the version of a dev build.",
			required: true,
		}),
		outDir: Flags.directory({
			description: "Release report output directory",
			required: true,
		}),
		fullReportFilePath: Flags.string({
			description: "Path to a report file in the 'full' format.",
			exists: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		if (flags.fullReportFilePath === undefined) {
			this.errorLog(`*.full.json file doesn't exist`);
			this.exit();
		}

		this.log(`Full manifest file path: ${flags.fullReportFilePath}`);

		try {
			await generateReleaseReportForUnreleasedVersions(
				flags.fullReportFilePath,
				flags.version,
				flags.outDir,
				this.logger,
			);
			this.log("Files processed successfully.");
		} catch (error: unknown) {
			this.error(`Error while generating release reports: ${error}`);
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
	fullReportFilePath: string,
	version: string,
	outDir: string,
	log: Logger,
): Promise<void> {
	const manifestData = await fs.readFile(fullReportFilePath, "utf8");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const jsonData: ReleaseReport = JSON.parse(manifestData);

	const caretReportOutput = toReportKind(jsonData, "caret");
	const simpleReportOutput = toReportKind(jsonData, "simple");

	const caretReportPath = path.join(outDir, `caret.json`);
	const simpleReportPath = path.join(outDir, `simple.json`);

	await writeJson(caretReportPath, caretReportOutput, { spaces: 2 });
	await writeJson(simpleReportPath, simpleReportOutput, { spaces: 2 });

	await writeManifestToFile(outDir, caretReportPath, "manifest", version, log);

	await writeManifestToFile(outDir, simpleReportPath, "simple", version, log);

	await Promise.all([
		fs.unlink(path.join(outDir, "caret.json")),
		fs.unlink(path.join(outDir, "simple.json")),
	]);
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
): Promise<void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);
	const manifestData = await fs.readFile(manifestFilePath, "utf8");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const jsonData: PackageVersionList = JSON.parse(manifestData);

	await updateManifestVersions(jsonData, ignorePackageList, version);

	const currentDate = formatISO(new Date(), { representation: "date" });

	const buildNumber = extractBuildNumber(version);

	log.log(`Build Number: ${buildNumber}`);

	const outDirByCurrentDate = path.join(outDir, `${revisedFileName}-${currentDate}.json`);
	const outDirByBuildNumber = path.join(outDir, `${revisedFileName}-${buildNumber}.json`);

	await Promise.all([
		fs.writeFile(manifestFilePath, JSON.stringify(jsonData, undefined, 2)),
		fs.writeFile(outDirByCurrentDate, JSON.stringify(jsonData, undefined, 2)),
		fs.writeFile(outDirByBuildNumber, JSON.stringify(jsonData, undefined, 2)),
	]);
}

/**
 * Updates versions in a manifest file based on specified conditions.
 * @param manifestFile - The manifest file object containing package names and versions.
 * @param ignorePackageList - The set of package names to ignore during version updating.
 * @param version - The version string to update packages to.
 */
async function updateManifestVersions(
	manifestFile: PackageVersionList,
	ignorePackageList: Set<string>,
	version: string,
): Promise<void> {
	for (const packageName of Object.keys(manifestFile)) {
		if (ignorePackageList.has(packageName)) {
			continue;
		}

		if (
			isInternalVersionRange(manifestFile[packageName], true) ||
			isInternalVersionScheme(manifestFile[packageName])
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
