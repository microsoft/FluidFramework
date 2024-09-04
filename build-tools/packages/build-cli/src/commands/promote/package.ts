/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { BaseCommand, readLines } from "../../library/index.js";

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
		"Used to promote a package to the Release view if it's a release build and in the build feed.  THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.";

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
			env: "ADO_API_TOKEN",
			required: true,
		}),
		releaseFlag: Flags.string({
			description: "Release flag e.g. (prerelease or release)",
			exists: true,
			required: true,
		}),
		feedKind: Flags.string({
			description: "ADO feed kind e.g. (internal-build or public)",
			exists: true,
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const { orderFile, releaseFlag, feedKind } = this.flags;
		if (releaseFlag !== "release") {
			return this.log(
				`${releaseFlag} packages will not be promoted to Release view. Only release packages will be promoted to Release view.`,
			);
		}
		if (feedKind !== "internal-build") {
			return this.log(
				`Packages from the ${feedKind} feed will not be promoted to Release view. Only internal-build feed packages will be promoted to Release view.`,
			);
		}
		const packageOrder = await readLines(orderFile);
		await Promise.all(
			packageOrder.map(async (packageName) => this.promotePackage(packageName)),
		);
	}

	private getFeedPromotionUrl(packageName: string, version: string): string {
		return `https://pkgs.dev.azure.com/fluidframework/internal/_apis/packaging/feeds/build/npm/${packageName}/versions/${version}?api-version=7.1-preview.1`;
	}

	private async promotePackage(packageName: string): Promise<boolean> {
		const url = this.getFeedPromotionUrl(packageName, this.flags.version);
		try {
			const response = await fetch(url, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Basic ${Buffer.from(this.flags.token).toString("base64")}`,
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
					{ exit: 1 },
				);
			}

			return true;
		} catch {
			this.error(`Error promoting package`, { exit: 2 });
		}
	}
}
