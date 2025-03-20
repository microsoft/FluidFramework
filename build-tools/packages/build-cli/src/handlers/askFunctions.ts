/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type VersionBumpType, bumpVersionScheme } from "@fluid-tools/version-tools";
import { rawlist } from "@inquirer/prompts";
import { Machine } from "jssm";

import { getDefaultBumpTypeForBranch } from "../library/index.js";
import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandler.js";
import { StateHandlerFunction } from "./stateHandlers.js";

/**
 * Determines the release type based on context, or by asking the user if needed.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const askForReleaseType: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType: inputBumpType, context, releaseVersion } = data;

	const gitRepo = await context.getGitRepository();
	const currentBranch = await gitRepo.getCurrentBranchName();
	const currentVersion = releaseVersion;
	const bumpedMajor = bumpVersionScheme(currentVersion, "major");
	const bumpedMinor = bumpVersionScheme(currentVersion, "minor");
	const bumpedPatch = bumpVersionScheme(currentVersion, "patch");

	// If an bumpType was set in the handler data, use it. Otherwise set it as the default for the branch. If there's
	// no default for the branch, ask the user.
	let bumpType = inputBumpType ?? getDefaultBumpTypeForBranch(currentBranch);
	if (inputBumpType === undefined) {
		const selectedBumpType: VersionBumpType = await rawlist({
			choices: [
				{ value: "major", name: `major (${currentVersion} => ${bumpedMajor.version})` },
				{ value: "minor", name: `minor (${currentVersion} => ${bumpedMinor.version})` },
				{ value: "patch", name: `patch  (${currentVersion} => ${bumpedPatch.version})` },
			],
			message: `The current branch is '${currentBranch}'. The default bump type for that branch is '${bumpType}', but you can change it now if needed.`,
		});
		bumpType = selectedBumpType;
		// eslint-disable-next-line require-atomic-updates
		data.bumpType = selectedBumpType;
	}

	if (bumpType === undefined) {
		throw new Error(`bumpType is undefined.`);
	}

	// This state is unique; it uses major/minor/patch as the actions
	const result = machine.action(bumpType);
	if (result !== true) {
		throw new Error(`Failed when calling the ${bumpType} action from the ${state} state.`);
	}

	return true;
};
