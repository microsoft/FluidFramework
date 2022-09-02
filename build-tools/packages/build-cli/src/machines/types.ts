/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "@fluidframework/build-tools";
import type { Machine } from "jssm";
import { CommandLogger } from "../logging";

export type MachineState = string;

export type StateHandlerFunction = (
    context: Context,
    state: string,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: any,
) => Promise<boolean>;

/**
 * A StateHandler is an object that can handle states.
 */
export interface StateHandler {
    handleState: StateHandlerFunction;
}

/**
 * A StateMachine combines an actual machine with known state and actions which are used to test that all states and
 * actions are accounted for. Note that this doesn't ensure all states are handled.
 */
// export interface StateMachine {
//     knownActions: string[];
//     knownStates: MachineState[];
//     machine: Machine<unknown>;
// }
