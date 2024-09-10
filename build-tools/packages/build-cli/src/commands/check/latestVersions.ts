/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Args } from "@oclif/core";
import * as semver from "semver";
import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import { BaseCommand, sortVersions } from "../../library/index.js";

export default class LatestVersionsCommand extends BaseCommand<typeof LatestVersionsCommand> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.";

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
			return semver.valid(v.version) !== null && semver.prerelease(v.version) === null;
		});

		const sortedByVersion = sortVersions(stableVersions, "version");

		// Group by major version
		const groupedVersions: { [key: number]: string[] } = {};

		for (const v of sortedByVersion) {
			const majorVersion: number = semver.major(v.version);
			if (!(majorVersion in groupedVersions)) {
				groupedVersions[majorVersion] = [];
			}
			groupedVersions[majorVersion].push(v.version);
		}

		// Find the highest version in each group
		const latestVersions = [];

		for (const majorVersion of Object.keys(groupedVersions)) {
			// Since grouped versions are sorted, the first element is the highest version
			const versionInfo = stableVersions.find(
				(v) => v.version === groupedVersions[Number(majorVersion)][0],
			);
			if (versionInfo) {
				latestVersions.push(versionInfo);
			}
		}

		const shouldDeploy = latestVersions.some((item) => item.version === versionInput);

		if (!shouldDeploy) {
			this.error("message", { exit: 1 });
		}
	}
}
