/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import chalk from "picocolors";
import prompts from "prompts";
import stripAnsi from "strip-ansi";

import { FluidRepo, MonoRepo } from "@fluidframework/build-tools";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import {
	checkFlags,
	dependencyUpdateTypeFlag,
	packageSelectorFlag,
	releaseGroupFlag,
	skipCheckFlag,
	testModeFlag,
} from "../../flags.js";
import {
	BaseCommand,
	// eslint-disable-next-line import/no-deprecated
	MonoRepoKind,
	generateBumpDepsBranchName,
	generateBumpDepsCommitMessage,
	indentString,
	isDependencyUpdateType,
	npmCheckUpdates,
} from "../../library/index.js";
// eslint-disable-next-line import/no-internal-modules
import { npmCheckUpdatesHomegrown } from "../../library/package.js";
import { ReleaseGroup } from "../../releaseGroups.js";

/**
 * Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
 * depend on package A, then this command will update the dependency range on package A. The dependencies and the
 * packages updated can be filtered using various flags.
 *
 * @remarks
 *
 * This command is roughly equivalent to `fluid-bump-version --dep`.
 */
export default class DepsCommand extends BaseCommand<typeof DepsCommand> {
	static readonly description =
		"Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.\n\nTo learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md";

	static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg(),
	} as const;

	static readonly flags = {
		updateType: dependencyUpdateTypeFlag({
			char: "t",
			default: "minor",
			description: "Bump the current version of the dependency according to this bump type.",
		}),
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
