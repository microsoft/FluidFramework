/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IPackage,
	getAllDependencies,
	setDependencyRange,
} from "@fluid-tools/build-infrastructure";
import { type Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { PackageName } from "@rushstack/node-core-library";
import latestVersion from "latest-version";
import chalk from "picocolors";
import * as semver from "semver";
import { releaseGroupNameFlag, testModeFlag } from "../../../flags.js";
import { BaseCommandWithBuildProject } from "../../../library/index.js";

/**
 * Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
 * depend on package A, then this command will update the dependency range on package A. The dependencies and the
 * packages updated can be filtered using various flags.
 *
 * @remarks
 *
 * This command is roughly equivalent to `fluid-bump-version --dep`.
 */
export default class ModifyFluidDepsCommand extends BaseCommandWithBuildProject<
	typeof ModifyFluidDepsCommand
> {
	static readonly description =
		"Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.\n\nTo learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md";

	static readonly flags = {
		on: releaseGroupNameFlag({ required: true }),
		releaseGroup: releaseGroupNameFlag({ required: true }),
		prerelease: Flags.boolean({
			dependsOn: ["updateType"],
			description: "Treat prerelease versions as valid versions to update to.",
		}),
		testMode: testModeFlag,
		...BaseCommandWithBuildProject.flags,
	} as const;

	static readonly examples = [
		// {
		// 	description:
		// 		"Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.",
		// 	command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t latest",
		// },
		// {
		// 	description:
		// 		"Bump dependencies on @fluidframework/build-common to the next minor version in the azure release group.",
		// 	command:
		// 		"<%= config.bin %> <%= command.id %> @fluidframework/build-common -t minor -g azure",
		// },
		// {
		// 	description:
		// 		"Bump dependencies on packages in the server release group to the greatest released version in the client release group. Include pre-release versions.",
		// 	command: "<%= config.bin %> <%= command.id %> server -g client -t greatest --prerelease",
		// },
		// {
		// 	description:
		// 		"Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with release ranges.",
		// 	command: "<%= config.bin %> <%= command.id %> server -t latest",
		// },
	];

	/**
	 * Runs the `modify fluid-deps` command.
	 */
	public async run(): Promise<void> {
		const { flags } = this;

		const buildProject = this.getBuildProject(flags.searchPath);
		const releaseGroup = buildProject.releaseGroups.get(flags.releaseGroup);
		const dependencyReleaseGroup = buildProject.releaseGroups.get(flags.on);

		if (releaseGroup === undefined) {
			this.error(`Release group not found: '${flags.releaseGroup}'`);
		}

		if (dependencyReleaseGroup === undefined) {
			this.error(`Release group not found: '${flags.on}'`);
		}

		if (flags.testMode) {
			this.log(chalk.yellowBright(`Running in test mode. No changes will be made.`));
		}

		// Get all the deps of the release group being updated
		const depsToUpdate = getAllDependencies(buildProject, releaseGroup.packages);

		if (!depsToUpdate.releaseGroups.includes(dependencyReleaseGroup)) {
			this.error(
				`Release group '${releaseGroup}' has no dependencies on '${dependencyReleaseGroup}'`,
			);
		}

		this.logHr();
		this.log(
			`Updating dependencies on '${chalk.blue(dependencyReleaseGroup.name)}' in the '${chalk.blue(releaseGroup.name)}' release group`,
		);
		this.log(`Prerelease: ${flags.prerelease ? chalk.green("yes") : "no"}`);
		this.logHr();
		this.log("");

		const latestDepVersions = await getLatestPackageVersions(
			dependencyReleaseGroup.packages,
			flags.prerelease,
			this.logger,
		);

		const versionSet = new Set(latestDepVersions.values());
		if (versionSet.size > 1) {
			this.error(
				`Found multiple versions in dependencies - expected only one. Versions: ${[...versionSet].join(", ")}`,
			);
		}
		const newVersion = [...versionSet][0];
		this.info(`Found updated version ${newVersion}`);

		await setDependencyRange(
			releaseGroup.packages,
			dependencyReleaseGroup.packages,
			`^${newVersion}`,
		);
	}
}

/**
 * Checks the npm registry for the latest version of the provided packages.
 */
async function getLatestPackageVersions(
	dependencies: IPackage[],
	prerelease: boolean,
	log?: Logger,
): Promise<Map<PackageName, string>> {
	/**
	 * A map of packages to their latest version.
	 */
	const packageVersions: Map<PackageName, string> = new Map();

	// Get the new version for each package based on the update type
	for (const { name: pkgName, private: isPrivate } of dependencies) {
		if (isPrivate) {
			// skip private packages
			continue;
		}
		let latest: string;
		let dev: string;

		try {
			// eslint-disable-next-line no-await-in-loop
			[latest, dev] = await Promise.all([
				latestVersion(pkgName, {
					version: "latest",
				}),
				latestVersion(pkgName, {
					version: "dev",
				}),
			]);
		} catch (error: unknown) {
			log?.warning(error as Error);
			continue;
		}

		// If we're allowing pre-release, use the version that has the 'dev' dist-tag in npm. Warn if it is lower than the 'latest'.
		if (prerelease) {
			packageVersions.set(pkgName, dev);
			if (semver.gt(latest, dev)) {
				log?.warning(
					`The 'latest' dist-tag is version ${latest}, which is greater than the 'dev' dist-tag version, ${dev}. Is this expected?`,
				);
			}
		} else {
			packageVersions.set(pkgName, latest);
		}
	}

	return packageVersions;
}
