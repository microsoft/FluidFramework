/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Machine } from "jssm";

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

	const { bumpType: bumpTypeLazy } = data;
	const bumpType = await bumpTypeLazy.value;

	// This state is unique; it uses major/minor/patch as the actions
	const result = machine.action(bumpType);
	if (result !== true) {
		throw new Error(`Failed when calling the ${bumpType} action from the ${state} state.`);
	}

	return true;
};
