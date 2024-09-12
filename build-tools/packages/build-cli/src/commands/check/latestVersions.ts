/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import { Args } from "@oclif/core";
import * as semver from "semver";
import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import { BaseCommand, sortVersions } from "../../library/index.js";

export default class LatestVersionsCommand extends BaseCommand<typeof LatestVersionsCommand> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only. Example: if the current latest release for each major version is 0.59.0, 1.4.0, and 2.3.0, the command will fail with an error if the input version does not match one of these versions. Exiting with an error will prompt the pipeline to skip the docs deployment step.";

	static readonly description =
		"This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version of a major version.";

	static readonly args = {
		version: Args.string({
			required: true,
			description: "The version corresponding to the pipeline trigger branch.",
		}),
		package_or_release_group: packageOrReleaseGroupArg({ required: true }),
	} as const;

	public async run(): Promise<void> {
		const { args } = this;
		const context = await this.getContext();
		const versionInput = this.args.version;

		const rgOrPackage = findPackageOrReleaseGroup(args.package_or_release_group, context);
		if (rgOrPackage === undefined) {
			this.error(`Package not found: ${args.package_or_release_group}`);
		}

		const versions = await context.getAllVersions(rgOrPackage.name);

		if (!versions) {
			this.error(`No versions found for ${rgOrPackage.name}`);
		}

		// Filter out pre-releases and versions with metadata
		const stableVersions = versions.filter((v) => {
			return !isInternalVersionScheme(v.version);
		});

		const sortedByVersion = sortVersions(stableVersions, "version");

		const latestVersions: Map<number, string> = new Map<number, string>();

		for (const v of sortedByVersion) {
			const majorVersion: number = semver.major(v.version);

			// Check if the map already has the major version
			// Since sortedByVersion is sorted, the first encountered version is the highest one
			if (!latestVersions.has(majorVersion)) {
				latestVersions.set(majorVersion, v.version);
			}
		}

		// Extract the latest versions into an array
		const latestVersionsArray = [...latestVersions.values()];

		const shouldDeploy = latestVersionsArray.includes(versionInput);

		if (!shouldDeploy) {
			this.error("skipping deployment stage", { exit: 1 });
		}
	}
}
