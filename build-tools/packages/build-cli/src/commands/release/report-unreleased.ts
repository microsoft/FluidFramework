/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "node-fetch";
import * as fs from "fs/promises";
import { Flags } from "@oclif/core";
import { Logger } from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";
import { PackageVersionList } from "../../lib";
import { isInternalVersionRange } from "@fluid-tools/version-tools";

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
	static readonly description = `Creates a release report for the most recent build of the client release group published to an internal ADO feed. It does this by finding the most recent build in ADO produced from a provided branch, and creates a report using that version. The report is a combination of the "simple" and "caret" report formats. Packages released as part of the client release group will have an exact version range, while other packages, such as server packages or independent packages, will have a caret-equivalent version range.`;

	static flags = {
		repo: Flags.string({
			description: "Repository name",
			required: true,
		}),
		ado_pat: Flags.string({
			description:
				"ADO Personal Access Token. This flag should be provided via the ADO_PAT environment variable for security reasons.",
			required: true,
			env: "ADO_PAT",
		}),
		sourceBranch: Flags.string({
			description: "Branch name across which the dev release manifest should be generated.",
			required: true,
		}),
		output: Flags.string({
			description: "Output manifest file path",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		const repoName: string[] = flags.repo.split("/");

		if (repoName.length !== 2) {
			throw new Error(
				"Invalid repository format. Provide the repository name in the format `owner/repository-name`.",
			);
		}

		const PACKAGE_NAME = "@fluidframework/container-runtime";
		const GITHUB_RELEASE_URL = `https://api.github.com/repos/${flags.repo}/releases`;
		const ADO_BASE_URL = `https://dev.azure.com/${repoName[1].toLowerCase()}/internal/_apis/build/builds?api-version=7.0`;
		const REGISTRY_URL = `https://pkgs.dev.azure.com/${repoName[1].toLowerCase()}/internal/_packaging/build/npm/registry/`;

		// Authorization header for Azure DevOps
		const authHeader = `Basic ${Buffer.from(`:${flags.ado_pat}`).toString("base64")}`;

		// Check if the authorization header is valid
		if (authHeader === undefined || authHeader === null) {
			this.error("Check your ADO Personal Access Token. It maybe incorrect or expired.");
		}

		try {
			// Get the most recent successful build number
			const buildNumber = await getFirstSuccessfulBuild(
				authHeader,
				ADO_BASE_URL,
				flags.sourceBranch,
				this.logger,
			);
			if (buildNumber !== undefined) {
				this.log(
					`Most recent successful build number within the last 24 hours for ${flags.sourceBranch} branch: ${buildNumber}`,
				);
				// Fetch the dev version number
				const devVersion = await fetchDevVersionNumber(
					authHeader,
					REGISTRY_URL,
					PACKAGE_NAME,
					buildNumber,
					this.logger,
				);
				if (devVersion !== undefined) {
					this.log(`Fetched dev version: ${devVersion}`);
					// Generate and write the modified manifest
					const manifestFile = await generateReleaseReportForUnreleasedVersions(
						GITHUB_RELEASE_URL,
						devVersion,
						this.logger,
					);
					if (manifestFile !== undefined) {
						await writeManifestToFile(manifestFile, flags.output, this.logger);
					}
				}
			} else if (buildNumber === undefined) {
				this.log(
					`No successful build found for ${flags.sourceBranch} branch in the last 24 hours`,
				);
			}
		} catch (error: unknown) {
			throw new Error(`Error creating manifest file: ${error}`);
		}
	}
}

/**
 * Fetches the first successful build number in the last 24 hours.
 * @param authHeader - Auth Header
 * @param adoUrl - Azure DevOps API URL
 * @param sourceBranch - Source branch name
 * @returns The build number if successful, otherwise undefined.
 */
async function getFirstSuccessfulBuild(
	authHeader: string,
	adoUrl: string,
	sourceBranch: string,
	log?: Logger,
): Promise<string | undefined> {
	try {
		const response = await fetch(adoUrl, { headers: { Authorization: authHeader } });
		const data = await response.json();

		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

		// Filter builds by date first
		const recentBuilds = data.value.filter(
			(build: IBuildDetails) => new Date(build.finishTime) >= twentyFourHoursAgo,
		);

		if (recentBuilds === undefined || recentBuilds.length === 0) {
			log?.errorLog(`No successful builds found in the last 24 hours`);
		}

		const successfulBuilds = recentBuilds.filter(
			(build: IBuildDetails) =>
				build.definition.name === "Build - client packages" &&
				build.status === "completed" &&
				build.result === "succeeded" &&
				build.sourceBranch === `refs/heads/${sourceBranch}`,
		);

		return successfulBuilds.length > 0
			? (successfulBuilds[0].buildNumber as string)
			: undefined;
	} catch (error) {
		log?.errorLog("Error fetching successful builds:", error);
		return undefined;
	}
}

/**
 * Fetches the dev version number released in the build feed.
 * @param authHeader - Authorization header for Azure DevOps
 * @param registryUrl - ADO Registry URL
 * @param packageName - Name of the package
 * @param buildNumber - The build number
 * @returns The dev version number if found, otherwise undefined.
 */
async function fetchDevVersionNumber(
	authHeader: string,
	registryUrl: string,
	packageName: string,
	buildNumber: string,
	log?: Logger,
): Promise<string | undefined> {
	try {
		const response = await fetch(`${registryUrl}/${packageName}`, {
			headers: { Authorization: authHeader },
		});
		const data = await response.json();
		const buildVersionKey: string | undefined = Object.keys(data.time).find((key) =>
			key.includes(buildNumber),
		);

		if (buildVersionKey !== undefined) {
			return buildVersionKey;
		}

		log?.log(`No version with build number ${buildNumber} found.`);
		return undefined;
	} catch (error: unknown) {
		log?.errorLog("Error fetching dev version number:", error);
		return undefined;
	}
}

/**
 * Generates a modified manifest file with the specified version number.
 * @param gitHubUrl - GitHub Release API URL.
 * @param version - The version number.
 */
async function generateReleaseReportForUnreleasedVersions(
	gitHubUrl: string,
	version: string,
	log?: Logger,
): Promise<PackageVersionList | undefined> {
	try {
		const releasesResponse = await fetch(gitHubUrl);
		const releases = await releasesResponse.json();

		let manifestAsset;

		for (const asset of releases[0].assets) {
			/**
			 * Only `caret` manifest file is required by partner repository.
			 * dev/prerelease versions are mapped to a single version instead of ranges but other packages such as common-utils and common-definitions
			 * required caret versions which simple manifest files do not provide.
			 * Example of simple manifest file:
			 * ```json
			 * {
			 * 	"@fluidframework/cell": "2.0.0-internal.6.1.1",
			 *	"@fluidframework/common-definitions": "0.20.1",
			 *	"@fluidframework/common-utils": "1.1.1",
			 * }
			 * ```
			 * Example of caret manifest file:
			 * ```json
			 * {
			 * 	"@fluidframework/cell": ">=2.0.0-internal.6.1.1 <2.0.0-internal.7.0.0",
			 *	"@fluidframework/common-definitions": "^0.20.1",
			 *	"@fluidframework/common-utils": "^1.1.1",
			 * }
			 * ```
			 */
			const includesCaretJson: boolean = asset.name.includes(".caret.json");
			if (includesCaretJson) {
				manifestAsset = asset;
				break;
			}
		}

		if (Object.keys(manifestAsset).length > 0) {
			const manifest_url_caret = manifestAsset.browser_download_url;
			const manifestResponse = await fetch(manifest_url_caret);
			const manifestData = await manifestResponse.buffer();

			const manifestFile: PackageVersionList = JSON.parse(manifestData.toString());

			for (const key of Object.keys(manifestFile)) {
				if (isInternalVersionRange(manifestFile[key], true)) {
					manifestFile[key] = version;
				}
			}

			return manifestFile;
		}

		return undefined;
	} catch (error) {
		log?.errorLog("Error generating manifest object:", error);
		return undefined;
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
		await fs.writeFile(output, JSON.stringify(manifestFile, null, 2));

		log?.log("Manifest modified successfully.", output);

		return output;
	} catch (error) {
		log?.errorLog("Error writing manifest to file:", error);
		return undefined;
	}
}
