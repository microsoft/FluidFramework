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

		const reportData = await fs.readFile(flags.fullReportFilePath, "utf8");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const fullReleaseReport: ReleaseReport = JSON.parse(reportData);

		try {
			await generateReleaseReport(fullReleaseReport, flags.version, flags.outDir, this.logger);
		} catch (error: unknown) {
			throw new Error(`Error while generating release reports: ${error}`);
		}
	}
}

/**
 * Generate release reports for unreleased versions.
 * @param fullReleaseReport - The format of the "full" release report.
 * @param version - The version string for the reports.
 * @param outDir - The output directory for the reports.
 * @param log - The logger object for logging messages.
 */
async function generateReleaseReport(
	fullReleaseReport: ReleaseReport,
	version: string,
	outDir: string,
	log: Logger,
): Promise<void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);

	await updateReportVersions(fullReleaseReport, ignorePackageList, version, log);

	const caretReportOutput = toReportKind(fullReleaseReport, "caret");
	const simpleReportOutput = toReportKind(fullReleaseReport, "simple");

	await Promise.all([
		writeReport(outDir, caretReportOutput as ReleaseReport, "manifest", version, log),
		writeReport(outDir, simpleReportOutput as ReleaseReport, "simpleManifest", version, log),
	]);

	log.log("Release report processed successfully.");
}

/**
 * Writes a modified release report to the output directory with the revised file name.
 * @param outDir - The output directory for the report.
 * @param report - A map of package names to full release reports.
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
 * @param report - A map of package names to full release reports. This is the format of the "full" release report.
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
			// If the caret range is a range, reset it to an exact version.
			// Note: Post 2.0 release, the versions will no longer be internal versions so another condition will be required that will work after 2.0.
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
