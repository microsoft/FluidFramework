/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Machine } from "jssm";

import { CommandLogger } from "../logging";
import { MachineState } from "../machines";

/**
 * An async function that handles state. Typically this type is used via the {@link BaseStateHandler} class and its
 * subclasses.
 */
export type StateHandlerFunction = (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: any,
) => Promise<boolean>;

/**
 * A StateHandler is an object that can handle states. Typically this type is used via the {@link BaseStateHandler}
 * class and its subclasses.
 */
export interface StateHandler {
    handleState: StateHandlerFunction;
}

/**
 * A base class that abstractly implements the {@link StateHandler} interface. Subclasses are expected to implement the
 * `handleState` method.
 */
export abstract class BaseStateHandler implements StateHandler {
    abstract handleState(
        state: MachineState,
        machine: Machine<unknown>,
        testMode: boolean,
        log: CommandLogger,
        data: unknown,
    ): Promise<boolean>;

    // eslint-disable-next-line no-useless-constructor
    public constructor(
        protected readonly machine: Machine<unknown>,
        protected readonly log: CommandLogger,
    ) {}

    /**
     * Sends the "success" action to a state machine. Throws an error if the state transition fails.
     *
     * @param machine - The state machine.
     * @param state - The state from which to transition. Only used for logging.
     */
    static signalSuccess(machine: Machine<unknown>, state: MachineState) {
        const transitioned = machine.action("success");
        if (!transitioned) {
            throw new Error(`Failed when signaling success from state: ${state}`);
        }
    }

    /**
     * Sends the "failure" action to a state machine. Throws an error if the state transition fails.
     *
     * @param machine - The state machine.
     * @param state - The state from which to transition. Only used for logging.
     */
    static signalFailure(machine: Machine<unknown>, state: MachineState) {
        const transitioned = machine.action("failure");
        if (!transitioned) {
            throw new Error(`Failed when signaling failure from state: ${state}`);
        }
    }
}
