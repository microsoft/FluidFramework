/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";

import { confirm, rawlist } from "@inquirer/prompts";
import execa from "execa";
import { Machine } from "jssm";

import { bumpVersionScheme } from "@fluid-tools/version-tools";
import { FluidRepo } from "@fluidframework/build-tools";

import {
	generateBumpDepsBranchName,
	generateBumpDepsCommitMessage,
	generateBumpVersionBranchName,
	generateBumpVersionCommitMessage,
	generateReleaseBranchName,
	getPreReleaseDependencies,
	getReleaseSourceForReleaseGroup,
	isReleased,
} from "../library/index.js";
import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";
import { ReleaseSource, isReleaseGroup } from "../releaseGroups.js";
import { getRunPolicyCheckDefault } from "../repoConfig.js";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandler.js";
import { BaseStateHandler, StateHandlerFunction } from "./stateHandlers.js";

/**
 * Only client and server release groups use changesets and the related release note and per-package changelog
 * generation. Other release groups use various other means to track changes.
 */
const releaseGroupsUsingChangesets = new Set(["client", "server"]);

/**
 * Checks that the current branch matches the expected branch for a release.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkBranchName: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, bumpType, shouldCheckBranch } = data;
	const gitRepo = await context.getGitRepository();
	if (shouldCheckBranch === true) {
		switch (bumpType) {
			case "patch": {
				log.verbose(`Checking if ${gitRepo.originalBranchName} starts with release/`);
				if (gitRepo.originalBranchName?.startsWith("release/") !== true) {
					log.warning(
						`Patch release should only be done on 'release/*' branches, but current branch is '${gitRepo.originalBranchName}'.\nYou can skip this check with --no-branchCheck.'`,
					);
					BaseStateHandler.signalFailure(machine, state);
				}

				break;
			}

			case "major":
			case "minor": {
				log.verbose(`Checking if ${gitRepo.originalBranchName} is 'main', 'next', or 'lts'.`);
				if (!["main", "next", "lts"].includes(gitRepo.originalBranchName ?? "")) {
					log.warning(
						`Release prep should only be done on 'main', 'next', or 'lts' branches, but current branch is '${gitRepo.originalBranchName}'.`,
					);
					BaseStateHandler.signalFailure(machine, state);
					return true;
				}
			}

			default: {
				log.errorLog(`Unexpected bump type: ${bumpType}`);
			}
		}
	} else {
		log.warning(
			`Not checking if current branch is a release branch: ${gitRepo.originalBranchName}`,
		);
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that the branch is up-to-date with the remote branch.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkBranchUpToDate: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, shouldCheckBranchUpdate } = data;

	const gitRepo = await context.getGitRepository();
	const remote = await gitRepo.getRemote(gitRepo.upstreamRemotePartialUrl);
	const isBranchUpToDate = await gitRepo.isBranchUpToDate(
		gitRepo.originalBranchName,
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		remote!,
	);
	if (shouldCheckBranchUpdate === true) {
		if (!isBranchUpToDate) {
			BaseStateHandler.signalFailure(machine, state);
			log.errorLog(
				`Local '${gitRepo.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
			);
		}

		BaseStateHandler.signalSuccess(machine, state);
	} else {
		log.warning("Not checking if the branch is up-to-date with the remote.");
		BaseStateHandler.signalSuccess(machine, state);
	}

	return true;
};

/**
 * Checks if the release group releases from a release branch or not.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkDoesReleaseFromReleaseBranch: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { releaseGroup } = data;

	let releaseSource: ReleaseSource = getReleaseSourceForReleaseGroup(releaseGroup);

	if (releaseSource === "interactive") {
		releaseSource = await rawlist({
			message: `The ${releaseGroup} release group can be released directly from main, or you can create a release branch. Would you like to release from main or a release branch? If in doubt, select 'release branch'.`,
			choices: [
				{
					name: "main/lts",
					value: "direct" as ReleaseSource,
				},
				{ name: "release branch", value: "releaseBranches" as ReleaseSource },
			],
		});
	}

	if (releaseSource === "direct") {
		BaseStateHandler.signalFailure(machine, state);
	} else if (releaseSource === "releaseBranches") {
		BaseStateHandler.signalSuccess(machine, state);
	}

	return true;
};

/**
 * Checks that the repo has a remote configured for the microsoft/FluidFramework repo.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkHasRemote: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context } = data;

	const gitRepo = await context.getGitRepository();
	const remote = await gitRepo.getRemote(gitRepo.upstreamRemotePartialUrl);
	if (remote === undefined) {
		BaseStateHandler.signalFailure(machine, state);
		log.errorLog(`Unable to find remote for '${gitRepo.upstreamRemotePartialUrl}'`);
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that the dependencies of a release group or package are installed.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkDependenciesInstalled: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup } = data;

	const packagesToCheck = isReleaseGroup(releaseGroup)
		? context.packagesInReleaseGroup(releaseGroup)
		: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			[context.fullPackageMap.get(releaseGroup)!];

	const installed = await FluidRepo.ensureInstalled(packagesToCheck);

	if (installed) {
		BaseStateHandler.signalSuccess(machine, state);
	} else {
		log.errorLog(`Error installing dependencies for: ${releaseGroup}`);
		BaseStateHandler.signalFailure(machine, state);
	}

	return true;
};

/**
 * Checks that the main and next branches are integrated.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkMainNextIntegrated: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType, context, shouldCheckMainNextIntegrated } = data;
	const gitRepo = await context.getGitRepository();

	if (bumpType === "major") {
		if (shouldCheckMainNextIntegrated === true) {
			const [main, next] = await Promise.all([
				gitRepo.getShaForBranch("main"),
				gitRepo.getShaForBranch("next"),
			]);

			if (main !== next) {
				BaseStateHandler.signalFailure(machine, state);
			}
		} else {
			log.warning("Skipping main/next integration check.");
		}
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that the repo is currently on the expected release branch.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkOnReleaseBranch: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, releaseVersion, shouldCheckBranch } = data;
	assert(context !== undefined, "Context is undefined.");

	const gitRepo = await context.getGitRepository();
	const currentBranch = await gitRepo.getCurrentBranchName();
	if (!isReleaseGroup(releaseGroup)) {
		// must be a package
		assert(
			context.fullPackageMap.has(releaseGroup),
			`Package ${releaseGroup} not found in context.`,
		);
	}

	const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion);

	if (shouldCheckBranch) {
		if (currentBranch === releaseBranch) {
			BaseStateHandler.signalSuccess(machine, state);
		} else {
			BaseStateHandler.signalFailure(machine, state);
		}
	} else {
		BaseStateHandler.signalSuccess(machine, state);
	}

	return true;
};

export const checkNoPrereleaseDependencies: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup } = data;

	const { isEmpty } = await getPreReleaseDependencies(context, releaseGroup);

	if (isEmpty) {
		BaseStateHandler.signalSuccess(machine, state);
	} else {
		BaseStateHandler.signalFailure(machine, state);
	}

	return true;
};

/**
 * Runs the `check policy` command to check for policy violations in the repo.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkPolicy: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, shouldCheckPolicy } = data;

	const gitRepo = await context.getGitRepository();
	log.info(`Checking policy`);
	if (shouldCheckPolicy === true) {
		if (!getRunPolicyCheckDefault(releaseGroup, gitRepo.originalBranchName)) {
			log.warning(
				`Policy check fixes for ${releaseGroup} are not expected on the ${gitRepo.originalBranchName} branch! Make sure you know what you are doing.`,
			);
		}

		// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
		// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
		// like we do in CI.
		const result = await execa.command(`npm run policy-check`, {
			cwd: context.root,
		});
		log.verbose(result.stdout);

		// check for policy check violation
		const afterPolicyCheckStatus = await gitRepo.gitClient.status();
		const isClean = afterPolicyCheckStatus.isClean();
		if (!isClean) {
			log.logHr();
			log.errorLog(
				`Policy check needed to make modifications. Please create a PR for the changes and merge before retrying.\n${afterPolicyCheckStatus.files.map((fileStatus) => `${fileStatus.index} ${fileStatus.path}`).join("\n")}`,
			);
			BaseStateHandler.signalFailure(machine, state);
			return false;
		}
	} else if (getRunPolicyCheckDefault(releaseGroup, gitRepo.originalBranchName) === false) {
		log.verbose(
			`Skipping policy check for ${releaseGroup} because it does not run on the ${gitRepo.originalBranchName} branch by default. Pass --policyCheck to force it to run.`,
		);
	} else {
		log.warning("Skipping policy check.");
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that a release branch exists.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkAssertTagging: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, shouldCheckPolicy } = data;
	const gitRepo = await context.getGitRepository();

	if (shouldCheckPolicy === true) {
		if (!getRunPolicyCheckDefault(releaseGroup, gitRepo.originalBranchName)) {
			log.warning(
				`Assert tagging for ${releaseGroup} is not expected on the ${gitRepo.originalBranchName} branch! Make sure you know what you are doing.`,
			);
		}

		// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
		// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
		// like we do in CI.
		const result = await execa.command(`npm run policy-check:asserts`, {
			cwd: context.root,
		});
		log.verbose(result.stdout);

		// check for policy check violation
		const afterPolicyCheckStatus = await gitRepo.gitClient.status();
		const isClean = afterPolicyCheckStatus.isClean();
		if (!isClean) {
			log.logHr();
			log.errorLog(
				`Asserts were tagged. Please create a PR for the changes and merge before retrying.\n${afterPolicyCheckStatus.files.map((fileStatus) => `${fileStatus.index} ${fileStatus.path}`).join("\n")}`,
			);
			BaseStateHandler.signalFailure(machine, state);
			return false;
		}
	} else if (getRunPolicyCheckDefault(releaseGroup, gitRepo.originalBranchName) === false) {
		log.verbose(
			`Skipping assert tagging for ${releaseGroup} because it does not run on the ${gitRepo.originalBranchName} branch by default. Pass --policyCheck to force it to run.`,
		);
	} else {
		log.warning("Skipping assert tagging.");
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that release notes have been generated.
 *
 * If release notes exist, then this function will send the "success" action to the state machine and return `true`. The
 * state machine will transition to the appropriate state based on the "success" action.
 *
 * If release notes have not been generated, then this function will send the "failure" action to the state machine and
 * still return `true`, since the state has been handled. The state machine will transition to the appropriate state
 * based on the "failure" action.
 *
 * Once this function returns, the state machine's state will be reevaluated and passed to another state handler.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode. In test mode, the function returns true immediately.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseNotes: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType, releaseGroup, releaseVersion } = data;

	if (
		// Only some release groups use changeset-based change-tracking.
		releaseGroupsUsingChangesets.has(releaseGroup) &&
		// This check should only be run for minor/major releases. Patch releases do not use changesets or generate release
		// notes so there is no need to check them.
		bumpType !== "patch"
	) {
		// Check if the release notes file exists
		const filename = `RELEASE_NOTES/${releaseVersion}.md`;

		if (!existsSync(filename)) {
			log.logHr();
			log.errorLog(
				`Release notes for ${releaseGroup} version ${releaseVersion} are not found.`,
			);
			BaseStateHandler.signalFailure(machine, state);
			return false;
		}
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that changelogs have been generated.
 *
 * If changelogs have been generated for the current release, then this function will send the "success" action to the
 * state machine and return `true`. The state machine will transition to the appropriate state based on the "success"
 * action.
 *
 * If changelogs have not been generated, then this function will send the "failure" action to the state machine and
 * still return `true`, since the state has been handled. The state machine will transition to the appropriate state
 * based on the "failure" action.
 *
 * Once this function returns, the state machine's state will be reevaluated and passed to another state handler.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode. In test mode, the function returns true immediately.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkChangelogs: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { releaseGroup, bumpType } = data;

	if (
		// Only some release groups use changeset-based change-tracking.
		releaseGroupsUsingChangesets.has(releaseGroup) &&
		// This check should only be run for minor/major releases. Patch releases do not use changesets or generate
		// per-package changelogs so there is no need to check them.
		bumpType !== "patch"
	) {
		const confirmed = await confirm({
			message: "Did you generate and commit the CHANGELOG.md files for the release?",
		});

		if (confirmed !== true) {
			log.logHr();
			log.errorLog(`Changelogs must be generated.`);
			BaseStateHandler.signalFailure(machine, state);
			// State was handled, so return true.
			return true;
		}
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that a release branch exists.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseBranchExists: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, releaseVersion } = data;
	assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);
	const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion);

	const gitRepo = await context.getGitRepository();
	const commit = await gitRepo.getShaForBranch(releaseBranch);
	if (commit === undefined) {
		log.errorLog(`Can't find the '${releaseBranch}' branch.`);
		BaseStateHandler.signalFailure(machine, state);
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that a release group has been bumped.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseGroupIsBumped: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, releaseVersion, bumpType } = data;

	context.repo.reload();
	const repoVersion = context.getVersion(releaseGroup);
	const targetVersion = bumpVersionScheme(releaseVersion, bumpType).version;

	if (repoVersion !== targetVersion) {
		BaseStateHandler.signalFailure(machine, state);
		return true;
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that the version of the release group or package in the repo has already been released. If this check
 * succeeds, it means that a bump is needed to bump the repo to the next version.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseIsDone: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, releaseVersion } = data;

	const wasReleased = await isReleased(context, releaseGroup, releaseVersion);
	if (wasReleased) {
		BaseStateHandler.signalSuccess(machine, state);
	} else {
		BaseStateHandler.signalFailure(machine, state);
	}

	return true;
};

/**
 * Checks whether changes should be committed automatically.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldCommit: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType, context, shouldCommit, releaseGroup, releaseVersion } = data;

	if (shouldCommit !== true) {
		BaseStateHandler.signalFailure(machine, state);
		return true;
	}

	const branchName = generateBumpVersionBranchName(releaseGroup, bumpType, releaseVersion);
	const commitMsg = generateBumpVersionCommitMessage(releaseGroup, bumpType, releaseVersion);

	const gitRepo = await context.getGitRepository();
	await gitRepo.createBranch(branchName);
	log.verbose(`Created bump branch: ${branchName}`);

	await gitRepo.gitClient.commit(commitMsg);
	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks whether changes should be committed automatically.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldCommitReleasedDepsBump: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup, shouldCommit } = data;

	if (shouldCommit !== true) {
		BaseStateHandler.signalSuccess(machine, state);
	}

	const gitRepo = await context.getGitRepository();
	assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);
	const branchName = generateBumpDepsBranchName(releaseGroup, "latest");
	await gitRepo.createBranch(branchName);

	log.verbose(`Created bump branch: ${branchName}`);
	log.info(`${releaseGroup}: Bumped prerelease dependencies to release versions.`);

	const commitMsg = generateBumpDepsCommitMessage("prerelease", "latest", releaseGroup);
	await gitRepo.gitClient.commit(commitMsg);
	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks whether optional checks should be run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldRunOptionalChecks: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { shouldSkipChecks } = data;
	if (shouldSkipChecks === true) {
		BaseStateHandler.signalFailure(machine, state);
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Checks that typetests:gen has been run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkTypeTestGenerate: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context } = data;
	const gitRepo = await context.getGitRepository();

	const typetestsGen = await confirm({
		message: `Have you run typetests:gen on the ${gitRepo.originalBranchName} branch?`,
	});
	if (typetestsGen === false) {
		BaseStateHandler.signalFailure(machine, state);
	} else {
		BaseStateHandler.signalSuccess(machine, state);
	}

	return true;
};

/**
 * Checks that typetests: prepare has been run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkTypeTestPrepare: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context } = data;
	const gitRepo = await context.getGitRepository();

	const typetestsPrep = await confirm({
		message: `Have you run typetests:prepare on the ${gitRepo.originalBranchName} branch?`,
	});
	if (typetestsPrep === false) {
		BaseStateHandler.signalFailure(machine, state);
	} else {
		BaseStateHandler.signalSuccess(machine, state);
	}

	return true;
};

/**
 * Checks that release group is known and valid.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkValidReleaseGroup: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup } = data;

	if (isReleaseGroup(releaseGroup)) {
		BaseStateHandler.signalSuccess(machine, state);
		// eslint-disable-next-line unicorn/no-negated-condition
	} else if (context.fullPackageMap.get(releaseGroup) !== undefined) {
		BaseStateHandler.signalSuccess(machine, state);
	} else {
		BaseStateHandler.signalFailure(machine, state);
	}

	return true;
};
