/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Machine } from "jssm";

import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";

/**
 * An async function that is called to handle a particular state from a
 * {@link https://stonecypher.github.io/jssm/docs/pages/WhatAreStateMachines.html | jssm state machine}. Typically this
 * type is used via the {@link BaseStateHandler} class and its subclasses.
 *
 * The function receives a current state, the state machine itself, a testMode boolean, and a `data` object of any type
 * that can contain contextual information for all the handlers of a particular state machine.
 *
 * The function is expected to send an action such as "success" or "failure" to the state machine to cause a transition.
 * Sending an action is called "handling the stete." If the state was handled, then the function returns `true`. If the
 * state was not handled, the function should return `false`.
 *
 * Note that this function should always return `true` if the state was handled -- if an action was applied to the state
 * machine -- even when sending a "failure" action. The returned value indicates that the state was handled, not that it
 * "succeeded".
 */
export type StateHandlerFunction = (
	/**
	 * The current state of the state machine.
	 */
	state: MachineState,

	/**
	 * The state machine itself.
	 */
	machine: Machine<unknown>,

	/**
	 * If `true`, the function is expected to return `true` immediately without running any actual logic. This is used to
	 * verify that all states in a state machine are handled.
	 */
	testMode: boolean,

	/**
	 * A logger that the function can use to log output.
	 */
	log: CommandLogger,

	/**
	 * Data that is unique to the state machine.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any,
) => Promise<boolean>;

/**
 * A StateHandler is an object that can handle states from a
 * {@link https://stonecypher.github.io/jssm/docs/pages/WhatAreStateMachines.html | jssm state machine}. Typically this
 * type is used via the {@link BaseStateHandler} class and its subclasses.
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
	static signalSuccess(machine: Machine<unknown>, state: MachineState): void {
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
	static signalFailure(machine: Machine<unknown>, state: MachineState): void {
		const transitioned = machine.action("failure");
		if (!transitioned) {
			throw new Error(`Failed when signaling failure from state: ${state}`);
		}
	}
}
