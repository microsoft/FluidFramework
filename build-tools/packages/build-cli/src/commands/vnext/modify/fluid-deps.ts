/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import chalk from "picocolors";
import prompts from "prompts";
import * as semver from "semver";
import stripAnsi from "strip-ansi";

import { FluidRepo, MonoRepo } from "@fluidframework/build-tools";

import { findPackageOrReleaseGroup } from "../../../args.js";
import {
	checkFlags,
	dependencyUpdateTypeFlag,
	packageSelectorFlag,
	releaseGroupFlag,
	releaseGroupNameFlag,
	semverFlag,
	skipCheckFlag,
	testModeFlag,
} from "../../../flags.js";
import {
	BaseCommand,
	// eslint-disable-next-line import/no-deprecated
	MonoRepoKind,
	generateBumpDepsBranchName,
	generateBumpDepsCommitMessage,
	indentString,
	isDependencyUpdateType,
	npmCheckUpdates,
} from "../../../library/index.js";
// eslint-disable-next-line import/no-internal-modules
import { npmCheckUpdatesHomegrown, type PackageVersionMap } from "../../../library/package.js";
import { ReleaseGroup } from "../../../releaseGroups.js";
import type { BuildProject } from "../../../../../../../../../../../code/Fluid-bt/build-tools/packages/build-infrastructure/lib/buildProject.js";
import type { IPackage } from "@fluid-tools/build-infrastructure";
import latestVersion from "latest-version";
import type { PackageName } from "@rushstack/node-core-library";

/**
 * Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
 * depend on package A, then this command will update the dependency range on package A. The dependencies and the
 * packages updated can be filtered using various flags.
 *
 * @remarks
 *
 * This command is roughly equivalent to `fluid-bump-version --dep`.
 */
export default class ModifyFluidDepsCommand extends BaseCommand<typeof ModifyFluidDepsCommand> {
	static readonly description =
		"Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.\n\nTo learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md";

	static readonly flags = {
		on: releaseGroupNameFlag({required: true}),
		releaseGroup: releaseGroupNameFlag({ required: true }),

		// version: semverFlag({
		// 	required: false,
		// 	description:
		// 		"The version to check. When running in CI, this value corresponds to the pipeline trigger branch.",
		// }),


		// updateType: dependencyUpdateTypeFlag({
		// 	char: "t",
		// 	default: "minor",
		// 	description: "Bump the current version of the dependency according to this bump type.",
		// }),
		prerelease: Flags.boolean({
			dependsOn: ["updateType"],
			description: "Treat prerelease versions as valid versions to update to.",
		}),
		onlyBumpPrerelease: Flags.boolean({
			description: "Only bump dependencies that are on pre-release versions.",
		}),
		releaseGroup: releaseGroupFlag({
			description: "Only bump dependencies within this release group.",
			exclusive: ["package"],
		}),
		package: packageSelectorFlag({
			description:
				"Only bump dependencies of this package. You can use scoped or unscoped package names. For example, both @fluid-tools/markdown-magic and markdown-magic are valid.",
			exclusive: ["releaseGroup"],
		}),
		commit: checkFlags.commit,
		install: checkFlags.install,
		skipChecks: skipCheckFlag,
		updateChecker: Flags.string({
			description:
				"Specify the implementation to use to update dependencies. The default, 'ncu', uses npm-check-updates under the covers. The 'homegrown' value is a new experimental updater written specifically for the Fluid Framework repo. This flag is experimental and may change or be removed at any time.",
			helpGroup: "EXPERIMENTAL",
			options: ["ncu", "homegrown"],
		}),
		testMode: testModeFlag,
		...BaseCommand.flags,
	} as const;

	static readonly examples = [
		{
			description:
				"Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.",
			command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t latest",
		},
		{
			description:
				"Bump dependencies on @fluidframework/build-common to the next minor version in the azure release group.",
			command:
				"<%= config.bin %> <%= command.id %> @fluidframework/build-common -t minor -g azure",
		},
		{
			description:
				"Bump dependencies on packages in the server release group to the greatest released version in the client release group. Include pre-release versions.",
			command: "<%= config.bin %> <%= command.id %> server -g client -t greatest --prerelease",
		},
		{
			description:
				"Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with release ranges.",
			command: "<%= config.bin %> <%= command.id %> server -t latest",
		},
	];

	/**
	 * An array of messages that will be shown after the command runs.
	 */
	private readonly finalMessages: string[] = [];

	/**
	 * Runs the `bump deps` command.
	 */
	public async run(): Promise<void> {
		const { args, flags } = this;

		const context = await this.getContext();
		const shouldInstall = flags.install && !flags.skipChecks;
		const shouldCommit = flags.commit && !flags.skipChecks;

		if (args.package_or_release_group === undefined) {
			this.error("No dependency provided.");
		}

		if (flags.testMode) {
			this.log(chalk.yellowBright(`Running in test mode. No changes will be made.`));
		}

		const rgOrPackage = findPackageOrReleaseGroup(args.package_or_release_group, context);
		if (rgOrPackage === undefined) {
			this.error(`Package not found: ${args.package_or_release_group}`);
		}

		const gitRepo = await context.getGitRepository();
		const branchName = await gitRepo.getCurrentBranchName();

		// eslint-disable-next-line import/no-deprecated
		if (args.package_or_release_group === MonoRepoKind.Server && branchName !== "next") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const { confirmed } = await prompts({
				type: "confirm",
				name: "confirmed",
				message: `Server releases should be consumed in the ${chalk.bold(
					"next",
				)} branch only. The current branch is ${branchName}. Are you sure you want to continue?`,
				initial: false,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onState: (state: any) => {
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			});

			if (confirmed !== true) {
				this.info("Cancelled");
				this.exit(0);
			}
		}

		/**
		 * A list of package names on which to update dependencies.
		 */
		const depsToUpdate: string[] = [];

		if (rgOrPackage instanceof MonoRepo) {
			depsToUpdate.push(
				...rgOrPackage.packages
					.filter((pkg) => pkg.packageJson.private !== true)
					.map((pkg) => pkg.name),
			);
		} else {
			if (rgOrPackage.packageJson.private === true) {
				this.error(`${rgOrPackage.name} is a private package; ignoring.`, { exit: 1 });
			}
			depsToUpdate.push(rgOrPackage.name);

			// Check that the package can be found in the context.
			const pkg = context.fullPackageMap.get(rgOrPackage.name);
			if (pkg === undefined) {
				this.error(`Package not found: ${rgOrPackage.name}`);
			}

			if (pkg.monoRepo !== undefined) {
				const rg = pkg.monoRepo.kind;
				this.errorLog(`${pkg.name} is part of the ${rg} release group.`);
				this.errorLog(
					`If you want to update dependencies on that package, run the following command:\n\n    ${
						this.config.bin
					} ${this.id} ${rg} ${this.argv.slice(1).join(" ")}`,
				);
				this.exit(1);
			}
		}

		this.logHr();
		this.log(`Dependencies: ${chalk.blue(rgOrPackage.name)}`);
		this.log(
			`Packages: ${chalk.blueBright(flags.releaseGroup ?? flags.package ?? "all packages")}`,
		);
		this.log(`Prerelease: ${flags.prerelease ? chalk.green("yes") : "no"}`);
		this.log(`Bump type: ${chalk.bold(flags.updateType ?? "unknown")}`);
		this.logHr();
		this.log("");

		if (!isDependencyUpdateType(flags.updateType) || flags.updateType === undefined) {
			this.error(`Unknown dependency update type: ${flags.updateType}`);
		}

		const { updatedPackages, updatedDependencies } =
			flags.updateChecker === "homegrown"
				? await npmCheckUpdatesHomegrown(
						context,
						flags.releaseGroup ?? flags.package, // if undefined the whole repo will be checked
						depsToUpdate,
						rgOrPackage instanceof MonoRepo ? rgOrPackage.releaseGroup : undefined,
						/* prerelease */ flags.prerelease,
						/* writeChanges */ !flags.testMode,
						this.logger,
					)
				: await npmCheckUpdates(
						context,
						flags.releaseGroup ?? flags.package, // if undefined the whole repo will be checked
						depsToUpdate,
						rgOrPackage instanceof MonoRepo ? rgOrPackage.releaseGroup : undefined,
						flags.updateType,
						/* prerelease */ flags.prerelease,
						/* writeChanges */ !flags.testMode,
						this.logger,
					);

		if (updatedPackages.length > 0) {
			if (shouldInstall) {
				if (!(await FluidRepo.ensureInstalled(updatedPackages))) {
					this.error("Install failed.");
				}
			} else {
				this.warning(`Skipping installation. Lockfiles might be outdated.`);
			}

			const updatedReleaseGroups: ReleaseGroup[] = [
				...new Set(
					updatedPackages
						.filter((p) => p.monoRepo !== undefined)
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						.map((p) => p.monoRepo!.releaseGroup),
				),
			];

			const changedVersionsString = [`Updated the following:`, ""];

			for (const rg of updatedReleaseGroups) {
				changedVersionsString.push(indentString(`${rg} (release group)`));
			}

			for (const pkg of updatedPackages) {
				if (pkg.monoRepo === undefined) {
					changedVersionsString.push(indentString(`${pkg.name}`));
				}
			}

			changedVersionsString.push(
				"",
				`Dependencies on ${chalk.blue(rgOrPackage.name)} updated:`,
				"",
			);

			for (const [pkgName, ver] of Object.entries(updatedDependencies)) {
				changedVersionsString.push(indentString(`${pkgName}: ${chalk.bold(ver)}`));
			}

			const changedVersionMessage = changedVersionsString.join("\n");
			if (shouldCommit) {
				const commitMessage = stripAnsi(
					`${generateBumpDepsCommitMessage(
						rgOrPackage.name,
						flags.updateType,
						flags.releaseGroup,
					)}\n\n${changedVersionMessage}`,
				);

				const bumpBranch = generateBumpDepsBranchName(
					rgOrPackage.name,
					flags.updateType,
					flags.releaseGroup,
				);
				this.log(`Creating branch ${bumpBranch}`);
				await gitRepo.createBranch(bumpBranch);
				await gitRepo.gitClient.commit(commitMessage);
				this.finalMessages.push(
					`You can now create a PR for branch ${bumpBranch} targeting ${gitRepo.originalBranchName}`,
				);
			} else {
				this.warning(`Skipping commit. You'll need to manually commit changes.`);
			}

			this.finalMessages.push(
				`\nUpdated ${depsToUpdate.length} dependencies across ${updatedPackages.length} packages.\n`,
				`${changedVersionMessage}`,
			);
		} else {
			this.log(chalk.green("No dependencies need to be updated."));
		}

		if (this.finalMessages.length > 0) {
			this.logHr();
			for (const msg of this.finalMessages) {
				this.log(msg);
			}
		}
	}
}

/**
 * Checks the npm registry for updates for a release group's dependencies.
 */
export async function getPackageVersions(
	packages: IPackage[],
	log?: Logger,
): Promise<{
	updatedPackages: PackageWithKind[];
	updatedDependencies: PackageVersionMap;
}> {
	if (releaseGroupFilter !== undefined && releaseGroup === releaseGroupFilter) {
		throw new Error(
			`releaseGroup and releaseGroupFilter are the same (${releaseGroup}). They must be different values.`,
		);
	}
	log?.info(`Calculating dependency updates...`);

	/**
	 * A map of packages that should be updated, and their latest version.
	 */
	const dependencyVersionMap = await findDepUpdates(depsToUpdate, prerelease, log);
	log?.verbose(
		`Dependencies to update:\n${JSON.stringify(dependencyVersionMap, undefined, 2)}`,
	);

	log?.info(`Determining packages to update...`);
	const selectionCriteria: PackageSelectionCriteria =
		releaseGroup === undefined
			? // if releaseGroup is undefined it means we should update all packages and release groups
				AllPackagesSelectionCriteria
			: {
					independentPackages: false,
					releaseGroups: [releaseGroup as ReleaseGroup],
					releaseGroupRoots: [releaseGroup as ReleaseGroup],
				};

	// Remove the filtered release group from the list if needed
	if (releaseGroupFilter !== undefined) {
		const indexOfFilteredGroup = selectionCriteria.releaseGroups.indexOf(releaseGroupFilter);
		if (indexOfFilteredGroup !== -1) {
			selectionCriteria.releaseGroups.splice(indexOfFilteredGroup, 1);
			selectionCriteria.releaseGroupRoots.splice(indexOfFilteredGroup, 1);
		}
	}

	const { filtered: packagesToUpdate } = await selectAndFilterPackages(
		context,
		selectionCriteria,
	);
	log?.info(
		`Found ${Object.keys(dependencyVersionMap).length} dependencies to update across ${
			packagesToUpdate.length
		} packages.`,
	);

	const dependencyUpdateMap = new Map<string, DependencyWithRange>();

	const versionSet = new Set<string>(Object.values(dependencyVersionMap));
	if (versionSet.size !== 1) {
		throw new Error(
			`Expected all the latest versions of the dependencies to match, but they don't. Unique versions: ${JSON.stringify(
				versionSet,
				undefined,
				2,
			)}`,
		);
	}

	const verString = [...versionSet][0];
	const newVersion = semver.parse(verString);
	if (newVersion === null) {
		throw new Error(`Couldn't parse version ${verString}`);
	}

	const range: InterdependencyRange = prerelease ? newVersion : `^${[...versionSet][0]}`;
	log?.verbose(`Calculated new range: ${range}`);
	for (const dep of Object.keys(dependencyVersionMap)) {
		const pkg = context.fullPackageMap.get(dep);

		if (pkg === undefined) {
			log?.warning(`Package not found: ${dep}. Skipping.`);
			continue;
		}

		dependencyUpdateMap.set(dep, { pkg, range });
	}

	const promises: Promise<boolean>[] = [];
	for (const pkg of packagesToUpdate) {
		promises.push(setPackageDependencies(pkg, dependencyUpdateMap, false, writeChanges));
	}
	const results = await Promise.all(promises);
	const packageStatus = zip(packagesToUpdate, results);
	const updatedPackages = packageStatus
		.filter(([, changed]) => changed === true)
		.map(([pkg]) => pkg);

	log?.info(`Updated ${updatedPackages.length} of ${packagesToUpdate.length} packages.`);

	return {
		updatedDependencies: dependencyVersionMap,
		updatedPackages,
	};
}

async function findDepUpdates(
	dependencies: IPackage[],
	prerelease: boolean,
	log?: Logger,
): Promise<PackageVersionMap> {
	/**
	 * A map of packages that should be updated, and their latest version.
	 */
	const dependencyVersionMap: Map<PackageName, string> = new Map();

	// Get the new version for each package based on the update type
	for (const {name: pkgName} of dependencies) {
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
			dependencyVersionMap.set(pkgName, dev);
			if (semver.gt(latest, dev)) {
				log?.warning(
					`The 'latest' dist-tag is version ${latest}, which is greater than the 'dev' dist-tag version, ${dev}. Is this expected?`,
				);
			}
		} else {
			dependencyVersionMap.set(pkgName, latest);
		}
	}

	return dependencyVersionMap;
}
