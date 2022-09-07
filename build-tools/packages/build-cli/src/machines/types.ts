/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Machine } from "jssm";

/**
 * A StateHandler is an object that can handle states.
 */
export interface StateHandler {
    handleState: (state: string) => Promise<boolean>;
    parentHandler?: StateHandler;
}

/**
 * A StateMachine combines an actual machine with known state and actions which are used to test that all states and
 * actions are accounted for. Note that this doesn't ensure all states are handled.
 */
export interface StateMachine extends StateHandler {
    knownActions: string[];
    knownStates: string[];
    machine: Machine<unknown>;
}
