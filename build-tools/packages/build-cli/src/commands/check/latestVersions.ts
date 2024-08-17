/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Args } from "@oclif/core";
import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import { BaseCommand, sortVersions } from "../../library/index.js";

export default class LatestVersionsCommand extends BaseCommand<typeof LatestVersionsCommand> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version.";

	static readonly description =
		"This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version of a major version.";

	static readonly args = {
		version: Args.string({
			required: true,
			description: "The version corresponding to the pipeline trigger branch.",
		}),
		package_or_release_group: packageOrReleaseGroupArg(),
	} as const;

	public async run(): Promise<boolean> {
		const { args } = this;
		const context = await this.getContext();
		const versionInput = this.args.version;

		if (args.package_or_release_group === undefined) {
			this.error("No dependency provided.");
		}

		const rgOrPackage = findPackageOrReleaseGroup(args.package_or_release_group, context);
		if (rgOrPackage === undefined) {
			this.error(`Package not found: ${args.package_or_release_group}`);
		}

		const versions = await context.getAllVersions(rgOrPackage.name);

		if (versions === undefined) {
			this.error(`No versions found for ${rgOrPackage.name}`);
		}

		const sortedByVersion = sortVersions(versions, "version");

		// Filter out versions that are not latest semver versions
		const filteredVersions = sortedByVersion.filter((item) =>
			/^\d+\.\d+\.\d+$/.test(item.version),
		);

		// Filter out versions that are not latest minor versions
		const seenMajors = new Set<string>();
		const latestVersions = filteredVersions.filter((item) => {
			const majorVersion = item.version.split(".")[0];
			if (seenMajors.has(majorVersion)) {
				return false;
			}
			seenMajors.add(majorVersion);
			return true;
		});

		// Check if the input version is in the list of latest versions
		return latestVersions.some((item) => item.version === versionInput);
	}
}
