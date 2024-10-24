/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { isInternalTestVersion } from "@fluid-tools/version-tools";
import type { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { formatISO } from "date-fns";

import { semverFlag } from "../../flags.js";
import { BaseCommand, type ReleaseReport, toReportKind } from "../../library/index.js";

export class UnreleasedReportCommand extends BaseCommand<typeof UnreleasedReportCommand> {
	static readonly summary =
		`Creates a release report for an unreleased build (one that is not published to npm), using an existing report in the "full" format as input.`;

	static readonly description =
		`This command is primarily used to upload reports for non-PR main branch builds so that downstream pipelines can easily consume them.`;

	static readonly flags = {
		version: semverFlag({
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
		branchName: Flags.string({
			description:
				"Branch name. For release branches, the manifest file is uplaoded by build number and not by current date.",
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
			await generateReleaseReport(
				fullReleaseReport,
				flags.version.version,
				flags.outDir,
				flags.branchName,
				this.logger,
			);
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
	branchName: string,
	log: Logger,
): Promise<void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);

	await updateReportVersions(fullReleaseReport, ignorePackageList, version, log);

	const caretReportOutput = toReportKind(fullReleaseReport, "caret");
	const simpleReportOutput = toReportKind(fullReleaseReport, "simple");

	await Promise.all([
		writeReport(
			outDir,
			caretReportOutput as ReleaseReport,
			"manifest",
			version,
			branchName,
			log,
		),
		writeReport(
			outDir,
			simpleReportOutput as ReleaseReport,
			"simpleManifest",
			version,
			branchName,
			log,
		),
	]);

	log.log("Release report processed successfully.");
}

/**
 * Writes a modified release report to the output directory with the revised file name.
 * @param outDir - The output directory for the report.
 * @param report - A map of package names to full release reports.
 * @param revisedFileName - The revised file name for the report.
 * @param version - The version string to update packages to.
 * @param branchName - The branch name
 * @param log - The logger object for logging messages.
 */
async function writeReport(
	outDir: string,
	report: ReleaseReport,
	revisedFileName: string,
	version: string,
	branchName: string,
	log: Logger,
): Promise<void> {
	const currentDate = formatISO(new Date(), { representation: "date" });
	const buildNumber = extractBuildNumber(version);

	log.log(`Build Number: ${buildNumber}`);

	const outDirByBuildNumber = path.join(outDir, `${revisedFileName}-${buildNumber}.json`);

	// Generate the build-number manifest unconditionally
	const promises = [fs.writeFile(outDirByBuildNumber, JSON.stringify(report, undefined, 2))];

	// Generate the date-based manifest only if the branch is main
	if (branchName === "refs/heads/main") {
		const outDirByCurrentDate = path.join(outDir, `${revisedFileName}-${currentDate}.json`);
		promises.push(fs.writeFile(outDirByCurrentDate, JSON.stringify(report, undefined, 2)));
	}

	await Promise.all(promises);
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
	const clientPackageName = "fluid-framework";

	const packageReleaseDetails = report[clientPackageName];

	if (packageReleaseDetails === undefined) {
		throw new Error(`Client package ${clientPackageName} is not defined in the report.`);
	}

	if (packageReleaseDetails.ranges?.caret === undefined) {
		throw new Error(`Caret version for ${clientPackageName} is not defined in the report.`);
	}

	if (packageReleaseDetails.version === undefined) {
		throw new Error(`Simple version for ${clientPackageName} is not defined in the report.`);
	}

	const clientVersionCaret = report[clientPackageName].ranges.caret;
	const clientVersionSimple = report[clientPackageName].version;

	log.log(`Caret version: ${clientVersionCaret}`);
	log.log(`Simple version: ${clientVersionSimple}`);

	for (const packageName of Object.keys(report)) {
		if (ignorePackageList.has(packageName)) {
			continue;
		}

		const packageInfo = report[packageName];

		// todo: add better checks
		if (packageInfo.ranges.caret && packageInfo.ranges.caret === clientVersionCaret) {
			report[packageName].ranges.caret = version;
		}

		if (packageInfo.version && packageInfo.version === clientVersionSimple) {
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
 * extractBuildNumber("2.1.0-260312");
 */

function extractBuildNumber(version: string): number {
	const versionParts: string[] = version.split("-");

	if (isInternalTestVersion(version)) {
		return Number.parseInt(versionParts[1], 10);
	}

	// Extract the last part of the version, which is the number you're looking for
	return Number.parseInt(versionParts[versionParts.length - 1], 10);
}
