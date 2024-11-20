/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { semverFlag } from "../../flags.js";
import { BaseCommand, readLines } from "../../library/index.js";

interface PackagePromotionErrorResponse {
	success: string;
	error: string;
	reason: string;
	message: string;
	typeName: string;
	typeKey: string;
	errorCode: number;
	eventId: number;
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
		version: semverFlag({
			description: "Version of the package to promote.",
			required: true,
		}),
		orderFile: Flags.file({
			description:
				"A file with package names that should be promoted. Such files can be created using `flub list`.",
			exists: true,
			required: true,
		}),
		token: Flags.string({
			description:
				"Azure DevOps access token. This parameter should be passed using the ADO_API_TOKEN environment variable for security purposes.",
			env: "ADO_API_TOKEN",
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const packageOrder = await readLines(this.flags.orderFile);

		try {
			const results = await Promise.all(
				packageOrder.map(async (packageName) => this.promotePackage(packageName)),
			);

			const successfulPackages = results.filter((result) => result.success);
			const failedPackages = results.filter((result) => !result.success);

			this.log("Package promotion summary:");
			this.log(`Total packages: ${results.length}`);
			this.log(`Successful: ${successfulPackages.length}`);
			this.log(`Failed: ${failedPackages.length}`);

			if (successfulPackages.length > 0) {
				this.log("\nSuccessfully promoted packages:");
				for (const pkg of successfulPackages) this.log(`- ${pkg.packageName}`);
			}

			if (failedPackages.length > 0) {
				this.log("\nFailed to promote the following packages:");
				for (const pkg of failedPackages) this.log(`- ${pkg.packageName}: ${pkg.error}`);
				this.error("Some packages failed to promote.", { exit: 1 });
			} else {
				this.log("\nAll packages promoted successfully.");
			}
		} catch (error) {
			this.error(`An unexpected error occurred during package promotion: ${error}`, {
				exit: 2,
			});
		}
	}

	private getFeedPromotionUrl(packageName: string, version: string): string {
		return `https://pkgs.dev.azure.com/fluidframework/internal/_apis/packaging/feeds/build/npm/${packageName}/versions/${version}?api-version=7.1-preview.1`;
	}

	private async promotePackage(
		packageName: string,
	): Promise<{ packageName: string; success: boolean; error?: string }> {
		const url = this.getFeedPromotionUrl(packageName, this.flags.version.version);
		try {
			const response = await fetch(url, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Basic ${Buffer.from(`:${this.flags.token}`).toString("base64")}`,
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
				const errorData = (await response.json()) as PackagePromotionErrorResponse | undefined;
				return {
					packageName,
					success: false,
					error: `Status: ${response.status}, Message: ${errorData?.message ?? "Unknown error"}`,
				};
			}

			return { packageName, success: true };
		} catch (error) {
			return {
				packageName,
				success: false,
				error: `Unexpected error: ${error}`,
			};
		}
	}
}
