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
import { BaseCommand } from "../../base";
import { type ReleaseReport, toReportKind } from "../../library";

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly summary =
		`Creates a release report for an unreleased build (one that is not published to npm), using an existing report in the "full" format as input.`;

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
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		try {
			await generateReleaseReport(
				flags.fullReportFilePath,
				flags.version,
				flags.outDir,
				this.logger,
			);
		} catch (error: unknown) {
			this.error(`Error while generating release reports: ${(error as Error).stack}`);
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
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const jsonData: ReleaseReport = JSON.parse(reportData);

	await updateReportVersions(jsonData, ignorePackageList, version, log);

	const caretReportOutput = toReportKind(jsonData, "caret");
	const simpleReportOutput = toReportKind(jsonData, "simple");

	await Promise.all([
		writeReport(outDir, caretReportOutput as ReleaseReport, "manifest", version, log),
		writeReport(outDir, simpleReportOutput as ReleaseReport, "simple", version, log),
	]);

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
	report: ReleaseReport,
	revisedFileName: string,
	version: string,
	log: Logger,
): Promise<void> {
	const currentDate = formatISO(new Date(), { representation: "date" });

	const buildNumber = extractBuildNumber(version);

	log.log(`Build Number: ${buildNumber}`);

	const outDirByCurrentDate = path.join(outDir, `${revisedFileName}-${currentDate}.json`);
	const outDirByBuildNumber = path.join(outDir, `${revisedFileName}-${buildNumber}.json`);

	await Promise.all([
		fs.writeFile(outDirByCurrentDate, JSON.stringify(report, undefined, 2)),
		fs.writeFile(outDirByBuildNumber, JSON.stringify(report, undefined, 2)),
	]);
}

/**
 * Updates versions in a release report based on specified conditions.
 * @param report - The release report object containing package names and versions.
 * @param ignorePackageList - The set of package names to ignore during version updating. These packages are not published to internal ADO feed.
 * @param version - The version string to update packages to.
 */
async function updateReportVersions(
	report: ReleaseReport,
	ignorePackageList: Set<string>,
	version: string,
	log: Logger,
): Promise<void> {
	for (const packageName of Object.keys(report)) {
		if (ignorePackageList.has(packageName)) {
			continue;
		}

		// updates caret ranges
		if (isInternalVersionRange(report[packageName].ranges.caret, true)) {
			report[packageName].ranges.caret = version;
		}

		if (isInternalVersionScheme(report[packageName].version)) {
			report[packageName].version = version;
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
