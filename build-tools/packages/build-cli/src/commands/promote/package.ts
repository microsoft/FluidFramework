/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../library/index.js";

interface PromotePackageResponse {
	success: boolean;
	message?: string;
}

/**
 * Promotes a package to the Release view in Azure DevOps Artifacts.
 */
export default class PromotePackageCommand extends BaseCommand<typeof PromotePackageCommand> {
	static readonly summary =
		"Promotes a package to the Release view in Azure DevOps Artifacts.";

	static readonly description =
		"Used to promote a package to the Release view if it's a release build and in the build feed.";

	static readonly flags = {
		version: Flags.string({
			description: "Version of the package",
			required: true,
		}),
		orderFile: Flags.file({
			description:
				"A file with package names that should be published. Such files can be created using `flub list`.",
			exists: true,
			required: true,
		}),
		token: Flags.string({
			description: "Azure DevOps access token",
			env: "SYSTEM_ACCESSTOKEN",
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const packageOrder = await readLines(this.flags.orderFile);
		await Promise.all(
			packageOrder.map(async (packageName) =>
				this.promotePackage(packageName, this.flags.version, this.flags.token),
			),
		);
	}

	private getFeedPromotionUrl(packageName: string, version: string): string {
		return `https://pkgs.dev.azure.com/fluidframework/internal/_apis/packaging/feeds/build/npm/${packageName}/versions/${version}?api-version=7.1-preview.1`;
	}

	private async promotePackage(
		packageName: string,
		version: string,
		token: string,
	): Promise<boolean> {
		const url = this.getFeedPromotionUrl(packageName, version);
		try {
			const response = await fetch(url, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
				},
				body: JSON.stringify({
					views: {
						op: "add",
						path: "/views/-",
						value: "Release",
					},
				}),
			});

			if (!response.ok) {
				const errorData = (await response.json()) as PromotePackageResponse;
				this.error(
					`Failed to promote package. Status: ${response.status}, Message: ${errorData.message ?? "Unknown error"}`,
				);
			}

			const responseData = (await response.json()) as PromotePackageResponse;
			return responseData.success;
		} catch (error) {
			this.error(`Error promoting package: ${(error as Error).message}`);
		}
	}
}

/**
 * Reads a file into an array of strings, one line per array element.
 */
async function readLines(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, "utf8");
	const lines = content.split(/\r?\n/);
	return lines.filter((line) => line.trim() !== "");
}
