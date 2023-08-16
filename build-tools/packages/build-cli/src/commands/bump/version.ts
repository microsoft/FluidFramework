/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import fetch from "node-fetch";
import * as fs from "fs";

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

export class Versions extends BaseCommand<typeof Versions> {
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
		}),
		bumpType: Flags.string({}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		// Authorization header for Azure DevOps
		const authHeader = `Basic ${Buffer.from(`:${flags.ado_pat}`).toString("base64")}`;

		try {
			const buildNumber = await getFirstSuccessfulBuild(
				authHeader,
				flags.organization,
				flags.project,
			);
			if (buildNumber) {
				console.log(`Most successful build number for the last 24 hours: ${buildNumber}`);
				const devVersion = await fetchDevVersionNumber(
					authHeader,
					flags.organization,
					flags.project,
					buildNumber,
				);
				if (devVersion) {
					console.log(`Fetched dev version: ${devVersion}`);
					await generateManifestFile(devVersion);
				}
			}
		} catch (error) {
			console.error("An error occurred:", error);
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
				build.sourceBranch === "refs/heads/main" &&
				new Date(build.finishTime) >= twentyFourHoursAgo,
		);

		return successfulBuilds.length > 0 ? successfulBuilds[0].buildNumber : undefined;
	} catch (error) {
		console.error("Error fetching successful builds:", error);
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
): Promise<string | undefined> {
	const REGISTRY_URL = `https://pkgs.dev.azure.com/${organization}/${project}/_packaging/build/npm/registry/`;
	try {
		const response = await fetch(`${REGISTRY_URL}/${PACKAGE_NAME}`, {
			headers: { Authorization: authHeader },
		});
		const data = await response.json();
		const time = data.time;

		// eslint-disable-next-line no-restricted-syntax
		for (const key in time) {
			if (key.includes(buildNumber)) {
				return key;
			}
		}

		console.log(`No version with build number ${buildNumber} found.`);
		return undefined;
	} catch (error: unknown) {
		console.error("Error fetching dev version number:", error);
		return undefined;
	}
}

/**
 * Generates a modified manifest file with the specified version number.
 * @param VERSION - The version number.
 */
async function generateManifestFile(VERSION: string): Promise<void> {
	try {
		const releasesResponse = await fetch(GITHUB_RELEASE_URL);
		const releases = await releasesResponse.json();

		// Find the latest caret.json internal manifest file URL
		const manifestAsset = releases[0].assets.find((asset: any) =>
			asset.name.includes(".caret.json"),
		);
		if (manifestAsset) {
			const manifest_url_caret = manifestAsset.browser_download_url;
			console.log(`Downloading latest internal manifest: ${manifest_url_caret}`);

			const manifestResponse = await fetch(manifest_url_caret);
			const manifestData = await (manifestResponse as any).buffer();
			// eslint-disable-next-line unicorn/prefer-string-slice
			const manifest_filename = `${manifest_url_caret.substring(
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				manifest_url_caret.lastIndexOf("/") + 1,
			)}`;
			const new_manifest_filename = `fluid-framework-release-manifest.client.${VERSION}.caret.json`;

			fs.writeFileSync(manifest_filename, manifestData);
			fs.renameSync(manifest_filename, new_manifest_filename);

			// eslint-disable-next-line unicorn/prefer-json-parse-buffer
			const modifiedManifest = JSON.parse(fs.readFileSync(new_manifest_filename, "utf-8"));
			// eslint-disable-next-line no-restricted-syntax
			for (const key in modifiedManifest) {
				if (modifiedManifest[key].includes("internal")) {
					modifiedManifest[key] = VERSION;
				}
			}

			fs.writeFileSync(new_manifest_filename, JSON.stringify(modifiedManifest, null, 2));
			console.log("Manifest modified successfully.");
		} else {
			console.log("No matching internal manifest file found.");
		}
	} catch (error) {
		console.error("Error generating manifest file:", error);
	}
}
