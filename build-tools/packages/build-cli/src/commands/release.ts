/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	VersionBumpType,
	bumpVersionScheme,
	detectVersionScheme,
} from "@fluid-tools/version-tools";
import { rawlist } from "@inquirer/prompts";
import { Config } from "@oclif/core";
import chalk from "picocolors";

import { findPackageOrReleaseGroup } from "../args.js";
import {
	bumpTypeFlag,
	checkFlags,
	packageSelectorFlag,
	releaseGroupFlag,
	skipCheckFlag,
} from "../flags.js";
import {
	FluidReleaseStateHandler,
	FluidReleaseStateHandlerData,
	StateHandler,
} from "../handlers/index.js";
import { PromptWriter } from "../instructionalPromptWriter.js";
// eslint-disable-next-line import/no-deprecated
import { MonoRepoKind, getDefaultBumpTypeForBranch } from "../library/index.js";
import { FluidReleaseMachine } from "../machines/index.js";
import { getRunPolicyCheckDefault } from "../repoConfig.js";
import { StateMachineCommand } from "../stateMachineCommand.js";

/**
 * Releases a package or release group. This command is mostly scaffolding and setting up the state machine, handlers,
 * and the data to pass to the handlers. Most of the logic for handling the release is contained in the
 * {@link FluidReleaseStateHandler} itself.
 */

export default class ReleaseCommand extends StateMachineCommand<typeof ReleaseCommand> {
	static readonly summary = "Releases a package or release group.";
	static readonly description =
		`The release command ensures that a release branch is in good condition, then walks the user through releasing a package or release group.

    The command runs a number of checks automatically to make sure the branch is in a good state for a release. If any of the dependencies are also in the repo, then they're checked for the latest release version. If the dependencies have not yet been released, then the command prompts to perform the release of the dependency, then run the release command again.

    This process is continued until all the dependencies have been released, after which the release group itself is released.`;

	readonly machine = FluidReleaseMachine;
	handler: StateHandler | undefined;
	data: FluidReleaseStateHandlerData | undefined;

	constructor(argv: string[], config: Config) {
		super(argv, config);
		this.data = undefined;
	}

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			exclusive: ["package"],
			required: false,
		}),
		package: packageSelectorFlag({
			exclusive: ["releaseGroup"],
			required: false,
		}),
		bumpType: bumpTypeFlag({
			required: false,
		}),
		skipChecks: skipCheckFlag,
		...checkFlags,
		...StateMachineCommand.flags,
	} as const;

	async init(): Promise<void> {
		await super.init();

		const [context] = await Promise.all([this.getContext(), this.initMachineHooks()]);
		const { argv, flags, logger, machine } = this;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const rgOrPackageName = flags.releaseGroup ?? flags.package!;
		assert(
			rgOrPackageName !== undefined,
			"Either release group and package flags must be provided.",
		);

		const packageOrReleaseGroup = findPackageOrReleaseGroup(rgOrPackageName, context);
		if (packageOrReleaseGroup === undefined) {
			this.error(`Could not find release group or package: ${rgOrPackageName}`, {
				exit: 1,
			});
		}
		const releaseGroup = packageOrReleaseGroup.name;
		const releaseVersion = packageOrReleaseGroup.version;
		const gitRepo = await context.getGitRepository();
		const currentBranch = await gitRepo.getCurrentBranchName();
		const bumpType = await getBumpType(flags.bumpType, currentBranch, releaseVersion);

		// eslint-disable-next-line no-warning-comments
		// TODO: can be removed once server team owns server releases
		// eslint-disable-next-line import/no-deprecated
		if (flags.releaseGroup === MonoRepoKind.Server && bumpType === "minor") {
			this.error(`Server release are always a ${chalk.bold("MAJOR")} release`);
		}

		// oclif doesn't support nullable boolean flags, so this works around that limitation by checking the args
		// passed into the command. If neither are passed, then the default is determined by the branch config.
		const userPolicyCheckChoice = argv.includes("--policyCheck")
			? true
			: argv.includes("--no-policyCheck")
				? false
				: undefined;

		const branchPolicyCheckDefault = getRunPolicyCheckDefault(
			releaseGroup,
			gitRepo.originalBranchName,
		);

		this.handler = new FluidReleaseStateHandler(machine, logger);

		this.data = {
			releaseGroup,
			releaseVersion,
			context,
			promptWriter: new PromptWriter(logger),
			bumpType,
			versionScheme: detectVersionScheme(releaseVersion),
			shouldSkipChecks: flags.skipChecks,
			shouldCheckPolicy:
				userPolicyCheckChoice ?? (branchPolicyCheckDefault && !flags.skipChecks),
			shouldCheckBranch: flags.branchCheck && !flags.skipChecks,
			shouldCheckMainNextIntegrated: !flags.skipChecks,
			shouldCommit: flags.commit && !flags.skipChecks,
			shouldInstall: flags.install && !flags.skipChecks,
			shouldCheckBranchUpdate: flags.updateCheck && !flags.skipChecks,
			exitFunc: (code: number): void => this.exit(code),
			command: this,
		};
	}
}

/**
 * Gets the bump type to use. If a bumpType was passed in, use it. Otherwise use the default for the branch. If
 * there's no default for the branch, ask the user.
 */
async function getBumpType(
	inputBumpType: VersionBumpType | undefined,
	branch: string,
	version: string,
): Promise<VersionBumpType> {
	const bumpedMajor = bumpVersionScheme(version, "major");
	const bumpedMinor = bumpVersionScheme(version, "minor");
	const bumpedPatch = bumpVersionScheme(version, "patch");

	let bumpType = inputBumpType ?? getDefaultBumpTypeForBranch(branch);
	if (bumpType === undefined) {
		const selectedBumpType = await rawlist({
			message: `The current branch is '${branch}'. There is no default bump type for this branch. What type of release are you doing?`,
			choices: [
				{
					value: "major" as VersionBumpType,
					name: `major (${version} => ${bumpedMajor.version})`,
				},
				{
					value: "minor" as VersionBumpType,
					name: `minor (${version} => ${bumpedMinor.version})`,
				},
				{
					value: "patch" as VersionBumpType,
					name: `patch  (${version} => ${bumpedPatch.version})`,
				},
			],
		});

		bumpType = selectedBumpType;
	}

	if (bumpType === undefined) {
		throw new Error(`bumpType is undefined.`);
	}

	return bumpType;
}
