/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

import { FluidRepo, MonoRepo, MonoRepoKind } from "@fluidframework/build-tools";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args";
import { BaseCommand } from "../../base";
import {
	checkFlags,
	dependencyUpdateTypeFlag,
	packageSelectorFlag,
	releaseGroupFlag,
	skipCheckFlag,
} from "../../flags";
import {
	generateBumpDepsBranchName,
	generateBumpDepsCommitMessage,
	indentString,
	isDependencyUpdateType,
	npmCheckUpdates,
} from "../../lib";
import { ReleaseGroup, isReleaseGroup } from "../../releaseGroups";

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
	static description =
		"Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.\n\nTo learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md";

	static args = {
		package_or_release_group: packageOrReleaseGroupArg,
	};

	static flags = {
		updateType: dependencyUpdateTypeFlag({
			char: "t",
			description: "Bump the current version of the dependency according to this bump type.",
			default: "minor",
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
		...BaseCommand.flags,
	};

	static examples = [
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
			command:
				"<%= config.bin %> <%= command.id %> server -g client -t greatest --prerelease",
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
		const args = this.args;
		const flags = this.flags;

		const context = await this.getContext();
		const shouldInstall = flags.install && !flags.skipChecks;
		const shouldCommit = flags.commit && !flags.skipChecks;

		const rgOrPackageName = args.package_or_release_group;
		if (rgOrPackageName === undefined) {
			this.error("No dependency provided.");
		}

		const rgOrPackage = findPackageOrReleaseGroup(rgOrPackageName, context);
		if (rgOrPackage === undefined) {
			this.error(`Package not found: ${rgOrPackageName}`);
		}

		const branchName = await context.gitRepo.getCurrentBranchName();

		// can be removed once server team owns their releases
		if (args.package_or_release_group === MonoRepoKind.Server && flags.updateType === "minor") {
			this.error(`Server release are always a ${chalk.bold("MAJOR")} release`);
		}

		if (args.package_or_release_group === MonoRepoKind.Server && flags.prerelease === true) {
			this.info(
				`${chalk.red.bold(
					"Client packages on main branch should NOT be consuming prereleases from server. Server prereleases should be consumed in next branch only",
				)}`,
			);
			if (branchName !== "next") {
				this.error(
					`Server prereleases should be consumed in ${chalk.bold("next")} branch only`,
				);
			}
		}

		/**
		 * A list of package names on which to update dependencies.
		 */
		const depsToUpdate: string[] = [];

		if (rgOrPackage instanceof MonoRepo) {
			depsToUpdate.push(...rgOrPackage.packages.map((pkg) => pkg.name));
		} else {
			depsToUpdate.push(rgOrPackageName);
			const pkg = context.fullPackageMap.get(rgOrPackageName);
			if (pkg === undefined) {
				this.error(`Package not found: ${rgOrPackageName}`);
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
		this.log(`Dependencies: ${chalk.blue(rgOrPackageName)}`);
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

		const { updatedPackages, updatedDependencies } = await npmCheckUpdates(
			context,
			flags.releaseGroup ?? flags.package, // if undefined the whole repo will be checked
			depsToUpdate,
			isReleaseGroup(rgOrPackageName) ? rgOrPackageName : undefined,
			flags.updateType,
			/* prerelease */ flags.prerelease,
			/* writeChanges */ true,
			this.logger,
		);

		if (updatedPackages.length > 0) {
			if (shouldInstall) {
				if (!(await FluidRepo.ensureInstalled(updatedPackages, false))) {
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
						.map((p) => p.monoRepo!.kind),
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
				`Dependencies on ${chalk.blue(rgOrPackageName)} updated:`,
				"",
			);

			for (const [pkgName, ver] of Object.entries(updatedDependencies)) {
				changedVersionsString.push(indentString(`${pkgName}: ${chalk.bold(ver)}`));
			}

			const changedVersionMessage = changedVersionsString.join("\n");
			if (shouldCommit) {
				const commitMessage = stripAnsi(
					`${generateBumpDepsCommitMessage(
						rgOrPackageName,
						flags.updateType,
						flags.releaseGroup,
					)}\n\n${changedVersionMessage}`,
				);

				const bumpBranch = generateBumpDepsBranchName(
					rgOrPackageName,
					flags.updateType,
					flags.releaseGroup,
				);
				this.log(`Creating branch ${bumpBranch}`);
				await context.createBranch(bumpBranch);
				await context.gitRepo.commit(commitMessage, "Error committing");
				this.finalMessages.push(
					`You can now create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}`,
				);
			} else {
				this.warning(`Skipping commit. You'll need to manually commit changes.`);
			}

			this.finalMessages.push(
				`\nUpdated ${depsToUpdate.length} dependencies across ${updatedPackages.length} packages.\n`,
				`${changedVersionMessage}`,
			);
		} else {
			this.log(chalk.red("No dependencies need to be updated."));
		}

		if (this.finalMessages.length > 0) {
			this.logHr();
			for (const msg of this.finalMessages) {
				this.log(msg);
			}
		}
	}
}
