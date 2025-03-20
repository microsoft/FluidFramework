/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseVersion, VersionBumpType, VersionScheme } from "@fluid-tools/version-tools";
import { Command } from "@oclif/core";
import { Machine } from "jssm";
import chalk from "picocolors";

import { InstructionalPromptWriter } from "../instructionalPromptWriter.js";
import { Context } from "../library/index.js";
import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";
import { ReleaseGroup, ReleasePackage } from "../releaseGroups.js";
import { askForReleaseType } from "./askFunctions.js";
import {
	checkAssertTagging,
	checkBranchName,
	checkBranchUpToDate,
	checkChangelogs,
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
	checkReleaseNotes,
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
	promptToGenerateChangelogs,
	promptToGenerateReleaseNotes,
	promptToIntegrateNext,
	promptToPRBump,
	promptToPRDeps,
	promptToRelease,
	promptToReleaseDeps,
	promptToRunMinorReleaseCommand,
	promptToRunTypeTests,
} from "./promptFunctions.js";
import { BaseStateHandler, type StateHandlerFunction } from "./stateHandlers.js";

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
	/**
	 * A map of state machine states to the function that should be called to handle that state.
	 */
	private readonly stateHandlerMap: Map<string, StateHandlerFunction> = new Map([
		["AskForReleaseType", askForReleaseType],
		["CheckAssertTagging", checkAssertTagging],
		["CheckBranchName", checkBranchName],
		["CheckBranchName2", checkBranchName],
		["CheckBranchName3", checkBranchName],
		["CheckBranchUpToDate", checkBranchUpToDate],
		["CheckChangelogs", checkChangelogs],
		["CheckDependenciesInstalled", checkDependenciesInstalled],
		["CheckDoesReleaseFromReleaseBranch", checkDoesReleaseFromReleaseBranch],
		["CheckDoesReleaseFromReleaseBranch2", checkDoesReleaseFromReleaseBranch],
		["CheckDoesReleaseFromReleaseBranch3", checkDoesReleaseFromReleaseBranch],
		["CheckHasRemote", checkHasRemote],
		["CheckMainNextIntegrated", checkMainNextIntegrated],
		["CheckNoPrereleaseDependencies", checkNoPrereleaseDependencies],
		["CheckNoPrereleaseDependencies2", checkNoPrereleaseDependencies],
		["CheckNoPrereleaseDependencies3", checkNoPrereleaseDependencies],
		["CheckOnReleaseBranch", checkOnReleaseBranch],
		["CheckOnReleaseBranch", checkOnReleaseBranch],
		["CheckOnReleaseBranch", checkOnReleaseBranch],
		["CheckOnReleaseBranch", checkOnReleaseBranch],
		["CheckOnReleaseBranch", checkOnReleaseBranch],
		["CheckOnReleaseBranch2", checkOnReleaseBranch],
		["CheckOnReleaseBranch3", checkOnReleaseBranch],
		["CheckPolicy", checkPolicy],
		["CheckReleaseBranchExists", checkReleaseBranchExists],
		["CheckReleaseGroupIsBumped", checkReleaseGroupIsBumped],
		["CheckReleaseGroupIsBumpedMinor", checkReleaseGroupIsBumped],
		["CheckReleaseGroupIsBumpedMinor2", checkReleaseGroupIsBumped],
		["CheckReleaseGroupIsBumpedPatch", checkReleaseGroupIsBumped],
		["CheckReleaseGroupIsBumpedPatch2", checkReleaseGroupIsBumped],
		["CheckReleaseIsDone", checkReleaseIsDone],
		["CheckReleaseIsDone2", checkReleaseIsDone],
		["CheckReleaseIsDone3", checkReleaseIsDone],
		["CheckReleaseNotes", checkReleaseNotes],
		["CheckShouldCommitBump", checkShouldCommit],
		["CheckShouldCommitDeps", checkShouldCommit],
		["CheckShouldCommitReleasedDepsBump", checkShouldCommitReleasedDepsBump],
		["CheckShouldRunOptionalChecks", checkShouldRunOptionalChecks],
		["CheckTypeTestGenerate", checkTypeTestGenerate],
		["CheckTypeTestGenerate2", checkTypeTestGenerate],
		["CheckTypeTestPrepare", checkTypeTestPrepare],
		["CheckTypeTestPrepare2", checkTypeTestPrepare],
		["CheckValidReleaseGroup", checkValidReleaseGroup],
		["DoBumpReleasedDependencies", doBumpReleasedDependencies],
		["DoMajorRelease", handleBumpType],
		["DoMinorRelease", handleBumpType],
		["DoPatchRelease", handleBumpType],
		["DoReleaseGroupBump", doReleaseGroupBump],
		["PromptToCommitBump", promptToCommitChanges],
		["PromptToCommitDeps", promptToCommitChanges],
		["PromptToCommitPolicy", promptToCommitChanges],
		["PromptToCommitReleasedDepsBump", promptToCommitChanges],
		["PromptToCreateReleaseBranch", promptToCreateReleaseBranch],
		["PromptToGenerateChangelogs", promptToGenerateChangelogs],
		["PromptToGenerateReleaseNotes", promptToGenerateReleaseNotes],
		["PromptToIntegrateNext", promptToIntegrateNext],
		["PromptToPRBump", promptToPRBump],
		["PromptToPRDeps", promptToPRDeps],
		["PromptToPRReleasedDepsBump", promptToPRDeps],
		["PromptToRelease", promptToRelease],
		["PromptToReleaseDeps", promptToReleaseDeps],
		["PromptToRunMinorReleaseCommand", promptToRunMinorReleaseCommand],
		["PromptToRunTypeTests", promptToRunTypeTests],

		[
			"ReleaseComplete",
			async (_, __, ___, log): Promise<boolean> => {
				log.info(chalk.green("Release complete!"));
				return true;
			},
		],
	]);

	async handleState(
		state: MachineState,
		machine: Machine<unknown>,
		testMode: boolean,
		log: CommandLogger,
		data: FluidReleaseStateHandlerData,
	): Promise<boolean> {
		const handlerFunction = this.stateHandlerMap.get(state);

		if (handlerFunction === undefined) {
			const superHandled = await super.handleState(state, machine, testMode, log, data);
			return superHandled;
		}

		await handlerFunction(state, machine, testMode, log, data);
		return true;
	}
}

/**
 * Checks if the bump type is defined in the handler data and signals success if it is set and failure otherwise.
 */
const handleBumpType: StateHandlerFunction = async (
	state,
	machine,
	testMode,
	log,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType } = data;

	if (bumpType === undefined) {
		BaseStateHandler.signalFailure(machine, state);
	} else {
		BaseStateHandler.signalSuccess(machine, state);
	}
	return true;
};
