/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg, semverArg } from "../../args.js";
import { BaseCommand } from "../../library/commands/base.js";
import { isLatestInMajor } from "../../library/latestVersions.js";

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

		const result = isLatestInMajor(
			versions.map((v) => v.version),
			versionInput.version,
		);

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
