/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IPackage,
	getAllDependencies,
	setDependencyRange,
} from "@fluid-tools/build-infrastructure";
import {
	RangeOperator,
	type RangeOperatorWithVersion,
	RangeOperators,
} from "@fluid-tools/version-tools";
import { type Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { PackageName } from "@rushstack/node-core-library";
import latestVersion from "latest-version";
import chalk from "picocolors";
import * as semver from "semver";
import { releaseGroupNameFlag, testModeFlag } from "../../../flags.js";
import { BaseCommandWithBuildProject } from "../../../library/index.js";

/**
 * Update the dependency version that a release group has on another release group. That is, if one or more packages in
 * the release group depend on package A in another release group, then this command will update the dependency range on
 * package A and all other packages in that release group.
 */
export default class ModifyFluidDepsCommand extends BaseCommandWithBuildProject<
	typeof ModifyFluidDepsCommand
> {
	static readonly description =
		"Update the dependency version that a release group has on another release group. That is, if one or more packages in the release group depend on package A in another release group, then this command will update the dependency range on package A and all other packages in that release group.\n\nTo learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md";

	static readonly flags = {
		releaseGroup: releaseGroupNameFlag({
			required: false,
			multiple: true,
			description:
				"A release group whose packages will be updated. This can be specified multiple times to updates dependencies for multiple release groups.",
		}),
		on: releaseGroupNameFlag({
			required: true,
			char: undefined,
			description:
				"A release group that contains dependent packages. Packages that depend on packages in this release group will be updated.",
		}),
		prerelease: Flags.boolean({
			description:
				"Update to the latest prerelease version, which might be an earlier release than latest.",
		}),
		dependencyRange: Flags.custom<RangeOperator>({
			char: "d",
			description:
				'Controls the type of dependency that is used when updating packages. Use "" (the empty string) to indicate exact dependencies. Note that dependencies on pre-release versions will always be exact.',
			default: "^",
			options: [...RangeOperators],
		})(),
		testMode: testModeFlag,
		...BaseCommandWithBuildProject.flags,
	} as const;

	static readonly examples = [
		{
			description:
				"Update 'client' dependencies on packages in the 'build-tools' release group to the latest release version.",
			command: "<%= config.bin %> <%= command.id %> -g client --on build-tools",
		},
		{
			description:
				"Update 'client' dependencies on packages in the 'server' release group to the latest version. Include pre-release versions.",
			command: "<%= config.bin %> <%= command.id %> -g client --on build-tools --prerelease",
		},
		{
			description:
				"Update 'client' dependencies on packages in the 'server' release group to the latest version. Include pre-release versions.",
			command: "<%= config.bin %> <%= command.id %> -g client --on server",
		},
	];

	/**
	 * Runs the `modify fluid-deps` command.
	 */
	public async run(): Promise<void> {
		const { flags } = this;

		const buildProject = this.getBuildProject(flags.searchPath);
		const releaseGroups =
			flags.releaseGroup === undefined
				? [...buildProject.releaseGroups.values()]
				: flags.releaseGroup.map((rg) => {
						const found = buildProject.releaseGroups.get(rg);
						if (found === undefined) {
							this.error(`Release group not found: '${flags.releaseGroup}'`);
						}
						return found;
					});
		const packagesToUpdate = releaseGroups.flatMap((rg) => rg.packages);
		const dependencyReleaseGroup = buildProject.releaseGroups.get(flags.on);
		if (dependencyReleaseGroup === undefined) {
			this.error(`Release group not found: '${flags.on}'`);
		}

		if (flags.testMode) {
			this.log(chalk.yellowBright(`Running in test mode. No changes will be made.`));
		}

		// Get all the deps of the release groups being updated
		const depsToUpdate = getAllDependencies(buildProject, packagesToUpdate);

		if (!depsToUpdate.releaseGroups.includes(dependencyReleaseGroup)) {
			this.error(
				`Selected release groups have no dependencies on '${dependencyReleaseGroup}'`,
			);
		}

		this.logHr();
		this.log(
			`Updating dependencies on '${chalk.blue(dependencyReleaseGroup.name)}' in the '${chalk.blue(releaseGroups.map((rg) => rg.name).join(", "))}' release group`,
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

		const newRange =
			`${flags.prerelease ? "" : flags.dependencyRange}${newVersion}` as RangeOperatorWithVersion;
		await setDependencyRange(packagesToUpdate, dependencyReleaseGroup.packages, newRange);

		const workspaces = new Set(releaseGroups.map((rg) => rg.workspace));
		for (const ws of workspaces) {
			try {
				// eslint-disable-next-line no-await-in-loop
				await ws.install(/* updateLockfile */ true);
				this.info(`Installed dependencies for workspace '${ws.name}'`);
			} catch (error) {
				this.warning(
					`Error installing dependencies for workspace '${ws.name}' - you should install dependencies manually.`,
				);
				// eslint-disable-next-line prefer-template
				this.verbose((error as Error).message + "\n\n" + (error as Error).stack);
				continue;
			}
		}
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
