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
	// TODO: splitting this into two paragraphs, one about what the command does and the other about how and where it's used.
	static readonly description =
		`Creates a release report for each build of the client release group published to an internal ADO feed. It creates a report using the version set in the pipeline run. The report is a combination of the "simple" and "caret" report formats. Packages released as part of the client release group will have an exact version range, while other packages, such as server packages or independent packages, will have a caret-equivalent version range.`;

	static readonly flags = {
		version: Flags.string({
			description:
				"Version to generate a report for. Typically, this version is the version of a dev build.",
			required: true,
			env: "VERSION",
		}),
		outDir: Flags.directory({
			description: "Manifest file output directory",
			required: true,
		}),
		caretManifestFilePath: Flags.string({
			description: "Path to caret manifest file",
			char: "c",
			default: ".",
		}),
		simpleManifestFilePath: Flags.string({
			description: "Path to simple manifest file",
			char: "s",
			default: ".",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		const caretManifestFilePath = await fs.readdir(flags.caretManifestFilePath);
		const simpleManifestFilePath = await fs.readdir(flags.simpleManifestFilePath);

		const caretJsonFilePath = caretManifestFilePath.find((file) =>
			file.endsWith(".caret.json"),
		);
		const simpleJsonFilePath = simpleManifestFilePath.find((file) =>
			file.endsWith(".simple.json"),
		);

		if (caretJsonFilePath === undefined || simpleJsonFilePath === undefined) {
			throw new Error(
				`Either *.caret.json or *.simple.json file doesn't exist: ${caretJsonFilePath} and ${simpleJsonFilePath}`,
			);
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

async function generateReleaseReportForUnreleasedVersions(
	caretJsonFilePath: string,
	simpleJsonFilePath: string,
	version: string,
	outDir: string,
	log: Logger,
): Promise<void> {
	if (caretJsonFilePath) {
		await writeManifestToFile(outDir, caretJsonFilePath, "manifest", version, log);
	}

	if (simpleJsonFilePath) {
		await writeManifestToFile(outDir, simpleJsonFilePath, "simpleManifest", version, log);
	}
}

async function writeManifestToFile(
	outDir: string,
	jsonFilePath: string,
	revisedFileName: string,
	version: string,
	log: Logger,
): Promise<string | void> {
	const ignorePackageList = new Set(["@types/jest-environment-puppeteer"]);
	try {
		const manifestData = await fs.readFile(jsonFilePath, "utf8");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const manifestFile: PackageVersionList = JSON.parse(manifestData);

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

		const currentDate = new Date().toISOString().slice(0, 10);

		const buildNumber = extractBuildNumber(version);

		log.log(`Build Number: ${buildNumber}`);

		await fs.writeFile(jsonFilePath, JSON.stringify(manifestFile, undefined, 2));
		await fs.copyFile(
			jsonFilePath,
			path.join(outDir, `${revisedFileName}-${currentDate}.json`),
		);
		await fs.copyFile(
			jsonFilePath,
			path.join(outDir, `${revisedFileName}-${buildNumber}.json`),
		);
	} catch (error) {
		log.errorLog("Error writing manifest to file:", error);
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
