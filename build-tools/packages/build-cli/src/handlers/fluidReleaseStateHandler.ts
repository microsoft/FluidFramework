/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command } from "@oclif/core";
import chalk from "chalk";
import { Machine } from "jssm";

import { Context } from "../library/index.js";

import { ReleaseVersion, VersionBumpType, VersionScheme } from "@fluid-tools/version-tools";

import { InstructionalPromptWriter } from "../instructionalPromptWriter.js";
import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";
import { ReleaseGroup, ReleasePackage } from "../releaseGroups.js";
import { askForReleaseType } from "./askFunctions.js";
import {
	checkAssertTagging,
	checkBranchName,
	checkBranchUpToDate,
	checkDependenciesInstalled,
	checkDoesReleaseFromReleaseBranch,
	checkHasRemote,
	checkMainNextIntegrated,
	checkNoPrereleaseDependencies,
	checkOnReleaseBranch,
	checkPolicy,
	checkReleaseBranchExists,
	checkReleaseGroupIsBumped,
	checkReleaseIsDone,
	checkShouldCommit,
	checkShouldCommitReleasedDepsBump,
	checkShouldRunOptionalChecks,
	checkTypeTestGenerate,
	checkTypeTestPrepare,
	checkValidReleaseGroup,
} from "./checkFunctions.js";
import { doBumpReleasedDependencies, doReleaseGroupBump } from "./doFunctions.js";
import { InitFailedStateHandler } from "./initFailedStateHandler.js";
import {
	promptToCommitChanges,
	promptToCreateReleaseBranch,
	promptToIntegrateNext,
	promptToPRBump,
	promptToPRDeps,
	promptToRelease,
	promptToReleaseDeps,
	promptToRunMinorReleaseCommand,
	promptToRunTypeTests,
} from "./promptFunctions.js";
import { BaseStateHandler } from "./stateHandlers.js";

/**
 * Data that is passed to all the handling functions for the {@link FluidReleaseMachine}. This data is intended to be
 * used only within the {@link FluidReleaseStateHandler}.
 */
export interface FluidReleaseStateHandlerData {
	/**
	 * The {@link Context}.
	 */
	context: Context;

	/**
	 * The release group or package that is being released.
	 */
	releaseGroup: ReleaseGroup | ReleasePackage;

	/**
	 * The version scheme used by the release group or package being released.
	 */
	versionScheme: VersionScheme;

	/**
	 * The bump type used for this release.
	 */
	bumpType: VersionBumpType;

	/**
	 * An {@link InstructionalPromptWriter} that the command can use to display instructional prompts.
	 */
	promptWriter: InstructionalPromptWriter;

	/**
	 * The version being released.
	 */
	releaseVersion: ReleaseVersion;

	/**
	 * True if all optional checks should be skipped.
	 */
	shouldSkipChecks: boolean;

	/**
	 * True if repo policy should be checked. This also affects assert tagging, which runs as part of policy.
	 */
	shouldCheckPolicy: boolean;

	/**
	 * True if the branch names should be checked.
	 */
	shouldCheckBranch: boolean;

	/**
	 * True if the branch must be up-to-date with the remote.
	 */
	shouldCheckBranchUpdate: boolean;

	/**
	 * True if changes should be committed automatically.
	 */
	shouldCommit: boolean;

	/**
	 * True if `npm install` should be run on changed release groups and packages.
	 */
	shouldInstall: boolean;

	/**
	 * True if the main and next branches should be checked to confirm that they are merged.
	 */
	shouldCheckMainNextIntegrated: boolean;

	/**
	 * The {@link Command} class that represents the release command, which is {@link ReleaseCommand}. This is used to
	 * get the command name and arguments for printing instructions to run the command again.
	 */
	command: Command;

	/**
	 * A function that the state handlers can call to exit the application if needed. If this is undefined then the
	 * handler function will not exit the app itself.
	 */
	exitFunc: (code: number) => void;
}

/**
 * A state handler for the {@link FluidReleaseMachine}. It uses the {@link InitFailedStateHandler} as a base class so
 * the Init and Failed states are handled by that class. The logic for the individual handler functions is not within
 * this class; it only acts as a "router" to route to the correct function based on the current state.
 */
export class FluidReleaseStateHandler extends InitFailedStateHandler {
	async handleState(
		state: MachineState,
		machine: Machine<unknown>,
		testMode: boolean,
		log: CommandLogger,
		data: FluidReleaseStateHandlerData,
	): Promise<boolean> {
		let superShouldHandle = false;

		switch (state) {
			case "AskForReleaseType": {
				await askForReleaseType(state, machine, testMode, log, data);
				break;
			}

			case "CheckShouldRunOptionalChecks": {
				await checkShouldRunOptionalChecks(state, machine, testMode, log, data);
				break;
			}

			case "CheckValidReleaseGroup": {
				await checkValidReleaseGroup(state, machine, testMode, log, data);
				break;
			}

			case "CheckPolicy": {
				await checkPolicy(state, machine, testMode, log, data);
				break;
			}

			case "CheckAssertTagging": {
				await checkAssertTagging(state, machine, testMode, log, data);
				break;
			}

			case "CheckHasRemote": {
				await checkHasRemote(state, machine, testMode, log, data);
				break;
			}

			case "CheckBranchUpToDate": {
				await checkBranchUpToDate(state, machine, testMode, log, data);
				break;
			}

			case "CheckNoPrereleaseDependencies3":
			case "CheckNoPrereleaseDependencies2":
			case "CheckNoPrereleaseDependencies": {
				await checkNoPrereleaseDependencies(state, machine, testMode, log, data);
				break;
			}

			case "DoPatchRelease":
			case "DoMinorRelease":
			case "DoMajorRelease": {
				if (testMode) return true;

				const { bumpType } = data;

				if (bumpType === undefined) {
					BaseStateHandler.signalFailure(machine, state);
				}

				BaseStateHandler.signalSuccess(machine, state);
				break;
			}

			case "CheckBranchName":
			case "CheckBranchName2":
			case "CheckBranchName3": {
				await checkBranchName(state, machine, testMode, log, data);
				break;
			}

			case "CheckDoesReleaseFromReleaseBranch":
			case "CheckDoesReleaseFromReleaseBranch2":
			case "CheckDoesReleaseFromReleaseBranch3": {
				await checkDoesReleaseFromReleaseBranch(state, machine, testMode, log, data);
				break;
			}

			case "CheckDependenciesInstalled": {
				await checkDependenciesInstalled(state, machine, testMode, log, data);
				break;
			}

			case "CheckMainNextIntegrated": {
				await checkMainNextIntegrated(state, machine, testMode, log, data);
				break;
			}

			case "CheckOnReleaseBranch":
			case "CheckOnReleaseBranch2":
			case "CheckOnReleaseBranch3": {
				await checkOnReleaseBranch(state, machine, testMode, log, data);
				break;
			}

			case "CheckReleaseIsDone":
			case "CheckReleaseIsDone2":
			case "CheckReleaseIsDone3": {
				await checkReleaseIsDone(state, machine, testMode, log, data);
				break;
			}

			case "CheckReleaseGroupIsBumped":
			case "CheckReleaseGroupIsBumpedMinor":
			case "CheckReleaseGroupIsBumpedMinor2":
			case "CheckReleaseGroupIsBumpedPatch":
			case "CheckReleaseGroupIsBumpedPatch2": {
				await checkReleaseGroupIsBumped(state, machine, testMode, log, data);
				break;
			}

			case "CheckTypeTestGenerate":
			case "CheckTypeTestGenerate2": {
				await checkTypeTestGenerate(state, machine, testMode, log, data);
				break;
			}

			case "CheckTypeTestPrepare":
			case "CheckTypeTestPrepare2": {
				await checkTypeTestPrepare(state, machine, testMode, log, data);
				break;
			}

			case "DoReleaseGroupBump": {
				await doReleaseGroupBump(state, machine, testMode, log, data);
				break;
			}

			case "DoBumpReleasedDependencies": {
				await doBumpReleasedDependencies(state, machine, testMode, log, data);
				break;
			}

			case "CheckReleaseBranchExists": {
				await checkReleaseBranchExists(state, machine, testMode, log, data);
				break;
			}

			case "CheckShouldCommitBump":
			case "CheckShouldCommitDeps": {
				await checkShouldCommit(state, machine, testMode, log, data);
				break;
			}

			case "CheckShouldCommitReleasedDepsBump": {
				await checkShouldCommitReleasedDepsBump(state, machine, testMode, log, data);
				break;
			}

			case "PromptToCreateReleaseBranch": {
				await promptToCreateReleaseBranch(state, machine, testMode, log, data);
				break;
			}

			case "PromptToIntegrateNext": {
				await promptToIntegrateNext(state, machine, testMode, log, data);
				break;
			}

			case "PromptToRelease": {
				await promptToRelease(state, machine, testMode, log, data);
				break;
			}

			case "PromptToPRDeps":
			case "PromptToPRReleasedDepsBump": {
				await promptToPRDeps(state, machine, testMode, log, data);
				break;
			}

			case "PromptToPRBump": {
				await promptToPRBump(state, machine, testMode, log, data);
				break;
			}

			case "PromptToCommitBump":
			case "PromptToCommitDeps":
			case "PromptToCommitPolicy":
			case "PromptToCommitReleasedDepsBump": {
				await promptToCommitChanges(state, machine, testMode, log, data);
				break;
			}

			case "PromptToReleaseDeps": {
				await promptToReleaseDeps(state, machine, testMode, log, data);
				break;
			}

			case "PromptToRunMinorReleaseCommand": {
				await promptToRunMinorReleaseCommand(state, machine, testMode, log, data);
				break;
			}

			case "PromptToRunTypeTests": {
				await promptToRunTypeTests(state, machine, testMode, log, data);
				break;
			}

			case "ReleaseComplete": {
				log.info(chalk.green("Release complete!"));
				break;
			}

			default: {
				superShouldHandle = true;
			}
		}

		if (superShouldHandle === true) {
			const superHandled = await super.handleState(state, machine, testMode, log, data);
			return superHandled;
		}

		return true;
	}
}
