/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "node-fetch";
import { promises as fsPromises } from "fs";
import { Flags } from "@oclif/core";
import { Logger } from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

const PACKAGE_NAME = "@fluidframework/container-runtime";
const GITHUB_RELEASE_URL = "https://api.github.com/repos/microsoft/FluidFramework/releases";

interface IBuildDetails {
	definition: { name: string };
	status: string;
	result: string;
	sourceBranch: string;
	finishTime: string;
	buildNumber: string;
}

export class GenerateManifestFile extends BaseCommand<typeof GenerateManifestFile> {
	static description = "Pass the right manifest file based on the type of release";

	static flags = {
		organization: Flags.string({
			description: "Organization name",
			char: "o",
			required: true,
		}),
		project: Flags.string({
			description: "Project name",
			char: "p",
			required: true,
		}),
		ado_pat: Flags.string({
			description: "ADO Personal Access Token",
			char: "t",
			required: true,
		}),
		sourceBranch: Flags.string({
			description: "Branch name across which the dev release manifest should be generated.",
			char: "s",
			required: true,
		}),
		bumpType: Flags.string({
			description: "Bump type: minor/dev",
			char: "b",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		// Authorization header for Azure DevOps
		const authHeader = `Basic ${Buffer.from(`:${flags.ado_pat}`).toString("base64")}`;

		if (authHeader === undefined || authHeader === null) {
			this.error("Check your ADO Personal Access Token. It maybe incorrect or expired.");
		}

		try {
			if (flags.bumpType === "dev") {
				const buildNumber = await getFirstSuccessfulBuild(
					authHeader,
					flags.organization,
					flags.project,
					flags.sourceBranch,
					this.logger,
				);
				if (buildNumber !== undefined) {
					this.log(
						`Most successful build number for the last 24 hours for ${flags.sourceBranch} branch: ${buildNumber}`,
					);
					const devVersion = await fetchDevVersionNumber(
						authHeader,
						flags.organization,
						flags.project,
						buildNumber,
						this.logger,
					);
					if (devVersion !== undefined) {
						this.log(`Fetched dev version: ${devVersion}`);
						await generateManifestFile(devVersion, this.logger);
					}
				}
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
	organization: string,
	project: string,
	sourceBranch: string,
	log?: Logger,
): Promise<string | undefined> {
	const ADO_BASE_URL = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?api-version=7.0`;
	try {
		const response = await fetch(ADO_BASE_URL, { headers: { Authorization: authHeader } });
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
 * Fetches the dev version number released in the specified build.
 * @param buildNumber - The build number.
 * @returns The dev version number if found, otherwise undefined.
 */
async function fetchDevVersionNumber(
	authHeader: string,
	organization: string,
	project: string,
	buildNumber: string,
	log?: Logger,
): Promise<string | undefined> {
	const REGISTRY_URL = `https://pkgs.dev.azure.com/${organization}/${project}/_packaging/build/npm/registry/`;
	try {
		const response = await fetch(`${REGISTRY_URL}/${PACKAGE_NAME}`, {
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
 * @param VERSION - The version number.
 */
async function generateManifestFile(VERSION: string, log?: Logger): Promise<void> {
	try {
		const releasesResponse = await fetch(GITHUB_RELEASE_URL);
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
			log?.log(`Downloading latest internal manifest: ${manifest_url_caret}`);

			const manifestResponse = await fetch(manifest_url_caret);
			const manifestData = await manifestResponse.buffer();
			const manifest_filename = manifest_url_caret.slice(
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				manifest_url_caret.lastIndexOf("/") + 1,
			);
			const new_manifest_filename = `fluid-framework-release-manifest.client.${VERSION}.caret.json`;

			await fsPromises.writeFile(manifest_filename, manifestData);
			await fsPromises.rename(manifest_filename, new_manifest_filename);

			const modifiedManifestBuffer = await fsPromises.readFile(new_manifest_filename);
			const modifiedManifest = JSON.parse(modifiedManifestBuffer.toString());

			for (const key of Object.keys(modifiedManifest)) {
				const includesInternal: boolean = modifiedManifest[key].includes("internal");
				if (includesInternal) {
					modifiedManifest[key] = VERSION;
				}
			}

			await fsPromises.writeFile(
				new_manifest_filename,
				JSON.stringify(modifiedManifest, null, 2),
			);
			log?.log("Manifest modified successfully.");
		} else {
			log?.log("No matching internal manifest file found.");
		}
	} catch (error) {
		log?.errorLog("Error generating manifest file:", error);
	}
}
