/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { releaseGroupNameFlag, semverFlag } from "../../../flags.js";
import { BaseCommandWithBuildProject } from "../../../library/commands/base.js";
import { getVersionsFromTags } from "../../../library/git.js";
import { isLatestInMajor } from "../../../library/latestVersions.js";

export default class LatestVersionsCommand extends BaseCommandWithBuildProject<
	typeof LatestVersionsCommand
> {
	static readonly summary =
		"Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.";

	static readonly description =
		"This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version of a major version.";

	static readonly flags = {
		releaseGroup: releaseGroupNameFlag({ required: true }),
		version: semverFlag({
			required: true,
			description:
				"The version to check. When running in CI, this value corresponds to the pipeline trigger branch.",
		}),
		tags: Flags.string({
			description:
				"The git tags to consider when determining whether a version is latest. Used for testing.",
			hidden: true,
			multiple: true,
		}),
		searchPath: Flags.string({
			description: "The path to build project. Used for testing.",
			hidden: true,
			multiple: false,
		}),
		...BaseCommandWithBuildProject.flags,
	} as const;

	public async run(): Promise<void> {
		const { args, flags } = this;

		const buildProject = this.getBuildProject(flags.searchPath);
		const releaseGroup = buildProject.releaseGroups.get(flags.releaseGroup);

		if (releaseGroup === undefined) {
			this.error(`Package not found: ${args.release_group}`);
		}

		const versionInput = flags.version;
		const git = await buildProject.getGitRepository();
		const versions = await getVersionsFromTags(git, releaseGroup, flags.tags);

		if (!versions) {
			this.error(`No versions found for ${releaseGroup.name}`);
		}

		const result = isLatestInMajor(versions, versionInput.version);

		if (result.isLatest) {
			this.log(
				`Version ${versionInput.version} is the latest version for major version ${result.majorVersion}`,
			);
			this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]true`);
			this.log(
				`##vso[task.setvariable variable=majorVersion;isoutput=true]${result.majorVersion}`,
			);
			return;
		}

		if (result.latestVersion !== undefined) {
			this.log(
				`##[warning]skipping deployment stage. input version ${versionInput.version} does not match the latest version ${result.latestVersion}`,
			);
			this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]false`);
			this.log(
				`##vso[task.setvariable variable=majorVersion;isoutput=true]${result.majorVersion}`,
			);
			return;
		}

		this.log(
			`##[warning]No major version found corresponding to input version ${versionInput.version}`,
		);
		this.log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]false`);
		this.log(
			`##vso[task.setvariable variable=majorVersion;isoutput=true]${result.majorVersion}`,
		);
	}
}
