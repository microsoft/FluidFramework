/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "node-fetch";
import { promises as fsPromises } from "fs";
import { Flags } from "@oclif/core";
import { Logger } from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";
import { isInternalVersionRange } from "@fluid-tools/version-tools";

interface IBuildDetails {
	definition: { name: string };
	status: string;
	result: string;
	sourceBranch: string;
	finishTime: string;
	buildNumber: string;
}

export class GenerateManifestFile extends BaseCommand<typeof GenerateManifestFile> {
	static description = `As all builds are published to build feed, this command picks the latest successful build against the provided branch name and generates dev manifest file.`;

	static flags = {
		repoName: Flags.string({
			description: "Repository name",
			required: true,
		}),
		ado_pat: Flags.string({
			description: "ADO Personal Access Token",
			required: true,
		}),
		sourceBranch: Flags.string({
			description: "Branch name across which the dev release manifest should be generated.",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		const PACKAGE_NAME = "@fluidframework/container-runtime";
		const GITHUB_RELEASE_URL = `https://api.github.com/repos/microsoft/${flags.repoName}/releases`;
		const ADO_BASE_URL = `https://dev.azure.com/${flags.repoName.toLowerCase()}/internal/_apis/build/builds?api-version=7.0`;
		const REGISTRY_URL = `https://pkgs.dev.azure.com/${flags.repoName.toLowerCase()}/internal/_packaging/build/npm/registry/`;

		// Authorization header for Azure DevOps
		const authHeader = `Basic ${Buffer.from(`:${flags.ado_pat}`).toString("base64")}`;

		if (authHeader === undefined || authHeader === null) {
			this.error("Check your ADO Personal Access Token. It maybe incorrect or expired.");
		}

		try {
			const buildNumber = await getFirstSuccessfulBuild(
				authHeader,
				ADO_BASE_URL,
				flags.sourceBranch,
				this.logger,
			);
			if (buildNumber !== undefined) {
				this.log(
					`Most successful build number for the last 24 hours for ${flags.sourceBranch} branch: ${buildNumber}`,
				);
				const devVersion = await fetchDevVersionNumber(
					authHeader,
					REGISTRY_URL,
					PACKAGE_NAME,
					buildNumber,
					this.logger,
				);
				if (devVersion !== undefined) {
					this.log(`Fetched dev version: ${devVersion}`);
					const manifest = await generateManifestObjectForDevReleases(
						GITHUB_RELEASE_URL,
						this.logger,
					);
					if (manifest !== undefined) {
						await writeManifestToFile(devVersion, manifest, this.logger);
					}
				}
			} else if (buildNumber === undefined) {
				this.log(
					`No successful build found for ${flags.sourceBranch} branch in the last 24 hours`,
				);
			}
		} catch (error: unknown) {
			this.errorLog(`Error creating manifest file: ${error}`);
		}
	}
}

/**
 * Fetches the first successful build number in the last 24 hours.
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

		const successfulBuilds = data.value.filter(
			(build: IBuildDetails) =>
				build.definition.name === "Build - client packages" &&
				build.status === "completed" &&
				build.result === "succeeded" &&
				build.sourceBranch === `refs/heads/${sourceBranch}` &&
				new Date(build.finishTime) >= twentyFourHoursAgo,
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
 * @param buildNumber - The build number.
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
		const buildVersionKey = Object.keys(data.time).find((key) => key.includes(buildNumber));

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
 * @param version - The version number.
 */
async function generateManifestObjectForDevReleases(
	gitHubUrl: string,
	log?: Logger,
): Promise<object | undefined> {
	try {
		const releasesResponse = await fetch(gitHubUrl);
		const releases = await releasesResponse.json();

		let manifestAsset;

		for (const asset of releases[0].assets) {
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

			const originalManifest = JSON.parse(manifestData.toString());
			const modifiedManifest: { [key: string]: any } = { ...originalManifest };

			return modifiedManifest;
		}

		return undefined;
	} catch (error) {
		console.error("Error generating manifest object:", error);
		return undefined;
	}
}

async function writeManifestToFile(
	version: string,
	modifiedManifest: { [key: string]: any }, // Add the type assertion here
	log?: Logger,
): Promise<string | undefined> {
	try {
		for (const key of Object.keys(modifiedManifest)) {
			if (isInternalVersionRange(modifiedManifest[key])) {
				modifiedManifest[key] = version;
			}
		}

		const new_manifest_filename = `fluid-framework-release-manifest.client.${version}.caret.json`;

		await fsPromises.writeFile(
			new_manifest_filename,
			JSON.stringify(modifiedManifest, null, 2),
		);

		log?.log("Manifest modified successfully.", new_manifest_filename);

		return new_manifest_filename;
	} catch (error) {
		console.error("Error writing manifest to file:", error);
		return undefined;
	}
}
