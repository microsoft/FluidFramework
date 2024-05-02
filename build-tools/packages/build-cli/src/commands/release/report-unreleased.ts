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

		try {
			await generateReleaseReport(
				flags.fullReportFilePath,
				flags.version,
				flags.outDir,
				this.logger,
			);
		} catch (error: unknown) {
			this.error(`Error while generating release reports: ${error}`);
		}
	}
}

/**
 * Generate release reports for unreleased versions.
 * @param fullReportFilePath - The path to a report file in the 'full' format.
 * @param version - The version string for the reports.
 * @param outDir - The output directory for the reports.
 * @param log - The logger object for logging messages.
 */
async function generateReleaseReport(
	fullReportFilePath: string,
	version: string,
	outDir: string,
	log: Logger,
): Promise<void> {
	const reportData = await fs.readFile(fullReportFilePath, "utf8");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const jsonData: ReleaseReport = JSON.parse(reportData);

	const caretReportOutput = toReportKind(jsonData, "caret");
	const simpleReportOutput = toReportKind(jsonData, "simple");

	const caretReportPath = path.join(outDir, `caret.json`);
	const simpleReportPath = path.join(outDir, `simple.json`);

	await Promise.all([
		writeJson(caretReportPath, caretReportOutput, { spaces: 2 }),
		writeJson(simpleReportPath, simpleReportOutput, { spaces: 2 }),
	]);

	await Promise.all([
		writeReport(outDir, caretReportPath, "manifest", version, log),
		writeReport(outDir, simpleReportPath, "simple", version, log),
	]);

	await Promise.all([fs.unlink(caretReportPath), fs.unlink(simpleReportPath)]);
	log.log("Release report processed successfully.");
}

/**
 * Writes a modified release report to the output directory with the revised file name.
 * @param outDir - The output directory for the report.
 * @param reportFilePath - The path to the original report.
 * @param revisedFileName - The revised file name for the report.
 * @param version - The version string to update packages to.
 * @param log - The logger object for logging messages.
 */
async function writeReport(
	outDir: string,
	reportFilePath: string,
	revisedFileName: string,
	version: string,
	log: Logger,
): Promise<void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);
	const reportData = await fs.readFile(reportFilePath, "utf8");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const jsonData: PackageVersionList = JSON.parse(reportData);

	await updateReportVersions(jsonData, ignorePackageList, version, log);

	const currentDate = formatISO(new Date(), { representation: "date" });

	const buildNumber = extractBuildNumber(version);

	log.log(`Build Number: ${buildNumber}`);

	const outDirByCurrentDate = path.join(outDir, `${revisedFileName}-${currentDate}.json`);
	const outDirByBuildNumber = path.join(outDir, `${revisedFileName}-${buildNumber}.json`);

	await Promise.all([
		fs.writeFile(outDirByCurrentDate, JSON.stringify(jsonData, undefined, 2)),
		fs.writeFile(outDirByBuildNumber, JSON.stringify(jsonData, undefined, 2)),
	]);
}

/**
 * Updates versions in a release report based on specified conditions.
 * @param report - The release report object containing package names and versions.
 * @param ignorePackageList - The set of package names to ignore during version updating. These packages are not published to internal ADO feed.
 * @param version - The version string to update packages to.
 */
async function updateReportVersions(
	report: PackageVersionList,
	ignorePackageList: Set<string>,
	version: string,
	log: Logger,
): Promise<void> {
	for (const packageName of Object.keys(report)) {
		if (ignorePackageList.has(packageName)) {
			continue;
		}

		if (
			isInternalVersionRange(report[packageName], true) ||
			isInternalVersionScheme(report[packageName])
		) {
			report[packageName] = version;
		}
	}
	log.log(`Release report updated pointing to version: ${version}`);
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
