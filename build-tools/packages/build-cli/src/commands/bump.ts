/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { confirm } from "@inquirer/prompts";
import { Flags } from "@oclif/core";
import chalk from "picocolors";
import * as semver from "semver";

import { FluidRepo, MonoRepo, Package } from "@fluidframework/build-tools";

import {
	InterdependencyRange,
	RangeOperators,
	ReleaseVersion,
	VersionChangeType,
	VersionScheme,
	WorkspaceRanges,
	bumpVersionScheme,
	detectVersionScheme,
	isInterdependencyRange,
} from "@fluid-tools/version-tools";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../args.js";
import { getDefaultInterdependencyRange } from "../config.js";
import { bumpTypeFlag, checkFlags, skipCheckFlag, versionSchemeFlag } from "../flags.js";
import {
	BaseCommand,
	generateBumpVersionBranchName,
	generateBumpVersionCommitMessage,
	setVersion,
} from "../library/index.js";

export default class BumpCommand extends BaseCommand<typeof BumpCommand> {
	static readonly summary =
		"Bumps the version of a release group or package to the next minor, major, or patch version, or to a specific version, with control over the interdependency version ranges.";

	static readonly description =
		`The bump command is used to bump the version of a release groups or individual packages within the repo. Typically this is done as part of the release process (see the release command), but it is sometimes useful to bump without doing a release, for example when moving a package from one release group to another.`;

	static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg(),
	} as const;

	static readonly flags = {
		bumpType: bumpTypeFlag({
			char: "t",
			description:
				"Bump the release group or package to the next version according to this bump type.",
			exclusive: ["exact"],
		}),
		exact: Flags.string({
			description:
				"An exact string to use as the version. The string must be a valid semver version string.",
			exclusive: ["bumpType", "scheme"],
		}),
		scheme: versionSchemeFlag({
			description: "Override the version scheme used by the release group or package.",
			required: false,
			exclusive: ["exact"],
		}),
		exactDepType: Flags.string({
			description:
				'[DEPRECATED - Use interdependencyRange instead.] Controls the type of dependency that is used between packages within the release group. Use "" to indicate exact dependencies.',
			options: [...RangeOperators, ...WorkspaceRanges],
			deprecated: {
				to: "interdependencyRange",
				message: "The exactDepType flag is deprecated. Use interdependencyRange instead.",
				version: "0.16.0",
			},
		}),
		interdependencyRange: Flags.string({
			char: "d",
			description:
				'Controls the type of dependency that is used between packages within the release group. Use "" (the empty string) to indicate exact dependencies. Use the workspace:-prefixed values to set interdependencies using the workspace protocol. The interdependency range will be set to the workspace string specified.',
			options: [...RangeOperators, ...WorkspaceRanges],
		}),
		commit: checkFlags.commit,
		install: checkFlags.install,
		skipChecks: skipCheckFlag,
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Bump @fluidframework/build-common to the next minor version.",
			command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t minor",
		},
		{
			description:
				"Bump the server release group to the next major version, forcing the semver version scheme.",
			command: "<%= config.bin %> <%= command.id %> server -t major --scheme semver",
		},
		{
			description:
				"By default, the bump command will run npm install in any affected packages and commit the results to a new branch. You can skip these steps using the --no-commit and --no-install flags.",
			command: "<%= config.bin %> <%= command.id %> server -t major --no-commit --no-install",
		},
		{
			description:
				"You can control how interdependencies between packages in a release group are expressed using the --interdependencyRange flag.",
			command:
				'<%= config.bin %> <%= command.id %> client --exact 2.0.0-internal.4.1.0 --interdependencyRange "~"',
		},
		{
			description:
				"You can set interdependencies using the workspace protocol as well. The interdependency range will be set to the workspace string specified.",
			command:
				'<%= config.bin %> <%= command.id %> client --exact 2.0.0-internal.4.1.0 --interdependencyRange "workspace:~"',
		},
	];

	/**
	 * An array of messages that will be shown after the command runs.
	 */
	private readonly finalMessages: string[] = [];

	public async run(): Promise<void> {
		const { args, flags } = this;

		if (args.package_or_release_group === undefined) {
			this.error("No dependency provided.");
		}

		// Fall back to the deprecated --exactDepType flag value if the new one isn't provided
		const interdepRangeFlag = flags.interdependencyRange ?? flags.exactDepType;

		let interdependencyRange: InterdependencyRange | undefined = isInterdependencyRange(
			interdepRangeFlag,
		)
			? interdepRangeFlag
			: undefined;

		const context = await this.getContext();
		const { bumpType } = flags;
		const workspaceProtocol =
			typeof interdependencyRange === "string"
				? interdependencyRange?.startsWith("workspace:")
				: false;
		const shouldInstall: boolean = flags.install && !flags.skipChecks;
		const shouldCommit: boolean = flags.commit && !flags.skipChecks;

		if (args.package_or_release_group === undefined) {
			this.error("No dependency provided.");
		}

		const rgOrPackage = findPackageOrReleaseGroup(args.package_or_release_group, context);
		if (rgOrPackage === undefined) {
			this.error(`Package not found: ${args.package_or_release_group}`);
		}

		if (bumpType === undefined && flags.exact === undefined) {
			this.error(`One of the following must be provided: --bumpType, --exact`);
		}

		let repoVersion: ReleaseVersion;
		let packageOrReleaseGroup: Package | MonoRepo;
		let scheme: VersionScheme | undefined;
		const exactVersion: semver.SemVer | null = semver.parse(flags.exact);
		const updatedPackages: IPackage[] = [];

		if (bumpType === undefined && exactVersion === null) {
			this.error(`--exact value invalid: ${flags.exact}`);
		}

		if (rgOrPackage instanceof MonoRepo) {
			const releaseRepo = rgOrPackage;
			assert(releaseRepo !== undefined, `Release repo not found for ${rgOrPackage.name}`);

			repoVersion = releaseRepo.version;
			scheme = flags.scheme ?? detectVersionScheme(repoVersion);
			// Update the interdependency range to the configured default if the one provided isn't valid
			interdependencyRange =
				interdependencyRange ?? getDefaultInterdependencyRange(releaseRepo, context);
			updatedPackages.push(...releaseRepo.packages);
			packageOrReleaseGroup = releaseRepo;
		} else {
			const releasePackage = rgOrPackage;

			if (releasePackage.monoRepo !== undefined) {
				const rg = releasePackage.monoRepo.kind;
				this.errorLog(`${releasePackage.name} is part of the ${rg} release group.`);
				this.errorLog(
					`If you want to bump that package, run the following command to bump the whole release group:\n\n    ${
						this.config.bin
					} ${this.id} ${rg} ${this.argv.slice(1).join(" ")}`,
				);
				this.exit(1);
			}

			repoVersion = releasePackage.version;
			scheme = flags.scheme ?? detectVersionScheme(repoVersion);
			updatedPackages.push(releasePackage);
			packageOrReleaseGroup = releasePackage;
		}

		const newVersion =
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			exactVersion ?? bumpVersionScheme(repoVersion, bumpType!, scheme);

		let bumpArg: VersionChangeType;
		if (bumpType === undefined) {
			if (exactVersion === null) {
				this.error(`bumpType and exactVersion are both null/undefined.`);
			} else {
				bumpArg = exactVersion;
			}
		} else {
			bumpArg = bumpType;
		}

		// Update the scheme based on the new version, unless it was passed in explicitly
		scheme = flags.scheme ?? detectVersionScheme(newVersion);

		this.logHr();
		this.log(`Release group/package: ${chalk.blueBright(rgOrPackage.name)}`);
		this.log(`Bump type: ${chalk.blue(bumpType ?? "exact")}`);
		this.log(`Scheme: ${chalk.cyan(scheme)}`);
		this.log(`Workspace protocol: ${workspaceProtocol === true ? chalk.green("yes") : "no"}`);
		this.log(`Versions: ${newVersion.version} <== ${repoVersion}`);
		this.log(
			`Interdependency range: ${interdependencyRange === "" ? "exact" : interdependencyRange}`,
		);
		this.log(`Install: ${shouldInstall ? chalk.green("yes") : "no"}`);
		this.log(`Commit: ${shouldCommit ? chalk.green("yes") : "no"}`);
		this.logHr();
		this.log("");

		// If a bump type was provided, ask the user to confirm. This is skipped when --exact is used.
		if (bumpType !== undefined) {
			const proceed = await confirm({
				message: `Proceed with the bump?`,
			});
			if (proceed !== true) {
				this.info(`Cancelled.`);
				this.exit(0);
			}
		}

		this.log(`Updating version...`);
		await setVersion(
			context,
			packageOrReleaseGroup,
			newVersion,
			interdependencyRange,
			this.logger,
		);

		if (shouldInstall) {
			if (!(await FluidRepo.ensureInstalled(updatedPackages))) {
				this.error("Install failed.");
			}
		} else {
			this.warning(`Skipping installation. Lockfiles might be outdated.`);
		}

		if (shouldCommit) {
			const commitMessage = generateBumpVersionCommitMessage(
				rgOrPackage.name,
				bumpArg,
				repoVersion,
				scheme,
			);

			const bumpBranch = generateBumpVersionBranchName(
				rgOrPackage.name,
				bumpArg,
				repoVersion,
				scheme,
			);
			this.log(`Creating branch ${bumpBranch}`);
			const gitRepo = await context.getGitRepository();
			await gitRepo.createBranch(bumpBranch);
			await gitRepo.gitClient.commit(commitMessage);
			this.finalMessages.push(
				`You can now create a PR for branch ${bumpBranch} targeting ${gitRepo.originalBranchName}`,
			);
		} else {
			this.warning(`Skipping commit. You'll need to manually commit changes.`);
		}

		if (this.finalMessages.length > 0) {
			this.logHr();
			for (const msg of this.finalMessages) {
				this.log(msg);
			}
		}
	}
}
