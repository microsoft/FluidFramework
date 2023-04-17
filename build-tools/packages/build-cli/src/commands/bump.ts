/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { strict as assert } from "assert";
import chalk from "chalk";
import inquirer from "inquirer";
import * as semver from "semver";

import { FluidRepo, MonoRepo, Package } from "@fluidframework/build-tools";

import {
	ReleaseVersion,
	VersionBumpType,
	VersionChangeType,
	VersionScheme,
	bumpVersionScheme,
	detectVersionScheme,
} from "@fluid-tools/version-tools";

import { packageOrReleaseGroupArg } from "../args";
import { BaseCommand } from "../base";
import { bumpTypeFlag, checkFlags, skipCheckFlag, versionSchemeFlag } from "../flags";
import {
	bumpReleaseGroup,
	generateBumpVersionBranchName,
	generateBumpVersionCommitMessage,
} from "../lib";
import { isReleaseGroup } from "../releaseGroups";

export default class BumpCommand extends BaseCommand<typeof BumpCommand> {
	static summary =
		"Bumps the version of a release group or package to the next minor, major, or patch version, or to a specific version, with control over the interdependency version ranges.";

	static description = `The bump command is used to bump the version of a release groups or individual packages within the repo. Typically this is done as part of the release process (see the release command), but it is sometimes useful to bump without doing a release, for example when moving a package from one release group to another.`;

	static args = {
		package_or_release_group: packageOrReleaseGroupArg,
	};

	static flags = {
		bumpType: bumpTypeFlag({
			char: "t",
			description:
				"Bump the release group or package to the next version according to this bump type.",
			exclusive: ["exact"],
		}),
		exact: Flags.string({
			description:
				"An exact string to use as the version. The string must be a valid semver string.",
			exclusive: ["bumpType", "scheme"],
		}),
		scheme: versionSchemeFlag({
			description: "Override the version scheme used by the release group or package.",
			required: false,
			exclusive: ["exact"],
		}),
		exactDepType: Flags.string({
			description:
				'Controls the type of dependency that is used between packages within the release group. Use "" to indicate exact dependencies.',
			options: ["^", "~", ""],
			default: "^",
		}),
		commit: checkFlags.commit,
		install: checkFlags.install,
		skipChecks: skipCheckFlag,
		...BaseCommand.flags,
	};

	static examples = [
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
				"You can control how interdependencies between packages in a release group are expressed using the --exactDepType flag.",
			command:
				'<%= config.bin %> <%= command.id %> client --exact 2.0.0-internal.4.1.0 --exactDepType "~"',
		},
	];

	/**
	 * An array of messages that will be shown after the command runs.
	 */
	private readonly finalMessages: string[] = [];

	public async run(): Promise<void> {
		const args = this.args;
		const flags = this.flags;

		const context = await this.getContext();
		const bumpType: VersionBumpType | undefined = flags.bumpType;
		const shouldInstall: boolean = flags.install && !flags.skipChecks;
		const shouldCommit: boolean = flags.commit && !flags.skipChecks;

		if (args.package_or_release_group === undefined) {
			this.error("ERROR: No dependency provided.");
		}

		if (bumpType === undefined && flags.exact === undefined) {
			this.error(`One of the following must be provided: --bumpType, --exact`);
		}

		let repoVersion: ReleaseVersion;
		let packageOrReleaseGroup: Package | MonoRepo;
		let scheme: VersionScheme | undefined;
		const exactDepType = flags.exactDepType ?? "^";
		const exactVersion: semver.SemVer | null = semver.parse(flags.exact);
		const updatedPackages: Package[] = [];

		if (bumpType === undefined && exactVersion === null) {
			this.error(`--exact value invalid: ${flags.exact}`);
		}

		if (exactDepType !== "" && exactDepType !== "^" && exactDepType !== "~") {
			// Shouldn't get here since oclif should catch the invalid arguments earlier, but this helps inform TypeScript
			// that the exactDepType will be one of the enum values.
			this.error(`Invalid exactDepType: ${exactDepType}`);
		}

		if (isReleaseGroup(args.package_or_release_group)) {
			const releaseRepo = context.repo.releaseGroups.get(args.package_or_release_group);
			assert(
				releaseRepo !== undefined,
				`Release repo not found for ${args.package_or_release_group}`,
			);

			repoVersion = releaseRepo.version;
			scheme = flags.scheme ?? detectVersionScheme(repoVersion);
			updatedPackages.push(...releaseRepo.packages);
			packageOrReleaseGroup = releaseRepo;
		} else {
			const releasePackage = context.fullPackageMap.get(args.package_or_release_group);
			if (releasePackage === undefined) {
				this.error(`Package not in context: ${releasePackage}`);
			}

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
			exactVersion === null
				? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  bumpVersionScheme(repoVersion, bumpType!, scheme).version
				: exactVersion.version;

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
		this.log(`Release group: ${chalk.blueBright(args.package_or_release_group)}`);
		this.log(`Bump type: ${chalk.blue(bumpType ?? "exact")}`);
		this.log(`Scheme: ${chalk.cyan(scheme)}`);
		this.log(`Versions: ${newVersion} <== ${repoVersion}`);
		this.log(`Exact dependency type: ${exactDepType === "" ? "exact" : exactDepType}`);
		this.log(`Install: ${shouldInstall ? chalk.green("yes") : "no"}`);
		this.log(`Commit: ${shouldCommit ? chalk.green("yes") : "no"}`);
		this.logHr();
		this.log("");

		// If a bump type was provided, ask the user to confirm. This is skipped when --exact is used.
		if (bumpType !== undefined) {
			const confirmIntegratedQuestion: inquirer.ConfirmQuestion = {
				type: "confirm",
				name: "proceed",
				message: `Proceed with the bump?`,
			};

			const answers = await inquirer.prompt(confirmIntegratedQuestion);
			if (answers.proceed !== true) {
				this.info(`Cancelled.`);
				this.exit(0);
			}
		}

		await bumpReleaseGroup(
			context,
			bumpArg,
			packageOrReleaseGroup,
			scheme,
			exactDepType,
			this.logger,
		);

		if (shouldInstall) {
			if (!(await FluidRepo.ensureInstalled(updatedPackages, false))) {
				this.error("Install failed.");
			}
		} else {
			this.warning(`Skipping installation. Lockfiles might be outdated.`);
		}

		if (shouldCommit) {
			const commitMessage = generateBumpVersionCommitMessage(
				args.package_or_release_group,
				bumpArg,
				repoVersion,
				scheme,
			);

			const bumpBranch = generateBumpVersionBranchName(
				args.package_or_release_group,
				bumpArg,
				repoVersion,
				scheme,
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

		if (this.finalMessages.length > 0) {
			this.logHr();
			for (const msg of this.finalMessages) {
				this.log(msg);
			}
		}
	}
}
