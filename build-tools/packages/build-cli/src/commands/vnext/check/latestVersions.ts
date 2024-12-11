/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import * as semver from "semver";
import { findReleaseGroup, releaseGroupArg, semverArg } from "../../../args.js";
import {
	BaseCommandWithBuildProject,
	getVersionsFromTags,
	sortVersions,
} from "../../../library/index.js";

type MajorVersion = number;

export default class LatestVersionsCommand extends BaseCommandWithBuildProject<
	typeof LatestVersionsCommand
> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.";

	static readonly description =
		"This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version of a major version.";

	static readonly args = {
		version: semverArg({
			required: true,
			description:
				"The version to check. When running in CI, this value corresponds to the pipeline trigger branch.",
		}),
		release_group: releaseGroupArg({ required: true }),
	} as const;

	public async run(): Promise<void> {
		const { args } = this;
		const buildProject = this.getBuildProject();
		const releaseGroup = findReleaseGroup(args.release_group, buildProject);

		const versionInput = args.version;

		if (releaseGroup === undefined) {
			this.error(`Package not found: ${args.release_group}`);
		}

		const git = await buildProject.getGitRepository();
		const versions = await getVersionsFromTags(releaseGroup, git);

		if (!versions) {
			this.error(`No versions found for ${releaseGroup.name}`);
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
