/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import * as semver from "semver";
import { findPackageOrReleaseGroup, packageOrReleaseGroupArg, semverArg } from "../../args.js";
import { BaseCommand, sortVersions } from "../../library/index.js";

type MajorVersion = number;

export default class LatestVersionsCommand extends BaseCommand<typeof LatestVersionsCommand> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.";

	static readonly description =
		"This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version of a major version.";

	static readonly deprecated =
		"This command is deprecated and will be removed in a future release. Use vnext:check:latestVersions instead.";

	static readonly args = {
		version: semverArg({
			required: true,
			description:
				"The version to check. When running in CI, this value corresponds to the pipeline trigger branch.",
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

		const gitRepo = await context.getGitRepository();
		const versions = await gitRepo.getAllVersions(rgOrPackage.name);

		if (!versions) {
			this.error(`No versions found for ${rgOrPackage.name}`);
		}

		// Filter out pre-release versions
		const stableVersions = versions.filter((v) => {
			return !isInternalVersionScheme(v.version);
		});

		// Sort the semver versions ordered from highest to lowest
		const sortedByVersion = sortVersions(stableVersions, "version");

		const inputMajorVersion: MajorVersion = semver.major(versionInput.version);

		for (const v of sortedByVersion) {
			const majorVersion: MajorVersion = semver.major(v.version);

			// Since sortedByVersion is sorted, the first encountered version is the highest one
			if (majorVersion === inputMajorVersion) {
				if (v.version === versionInput.version) {
					// Check if the input version is the latest version for the major version
					this.log(
						`Version ${versionInput.version} is the latest version for major version ${majorVersion}`,
					);
					this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]true`);
					this.log(
						`##vso[task.setvariable variable=majorVersion;isoutput=true]${majorVersion}`,
					);
					return;
				}

				// If versions do not match on first major version encounter, then the input version is not the latest
				this.log(
					`##[warning]skipping deployment stage. input version ${versionInput.version} does not match the latest version ${v.version}`,
				);
				this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]false`);
				this.log(`##vso[task.setvariable variable=majorVersion;isoutput=true]${majorVersion}`);
				return;
			}
		}

		// Error if no major version corresponds to input version
		this.log(
			`##[warning]No major version found corresponding to input version ${versionInput.version}`,
		);
		this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]false`);
		this.log(
			`##vso[task.setvariable variable=majorVersion;isoutput=true]${inputMajorVersion}`,
		);
	}
}
