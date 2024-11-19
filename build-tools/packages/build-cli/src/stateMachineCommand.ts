/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import { Machine } from "jssm";
import chalk from "picocolors";

import { testModeFlag } from "./flags.js";
import { StateHandler } from "./handlers/index.js";
import { BaseCommand } from "./library/index.js";

/**
 * A base CLI command that uses an internal state machine to govern its behavior. Subclasses must provide a state
 * machine and a handler.
 *
 * When the command is run, the state machine is initialized, and the command loops over the state machine, calling its
 * {@link StateHandler} with the current state.
 *
 * @remarks
 *
 * The command provides a `testMode` flag, which subclasses are expected to check when handling states. If in test mode,
 * all handled states should immediately return true. This enables tests to verify that new states are handled in some
 * way.
 *
 * The command also provides a `state` flag that can be used to initialize the state machine to a specific state. This
 * is intended for testing.
 */
export abstract class StateMachineCommand<
	T extends typeof Command & { flags: typeof StateMachineCommand.flags },
> extends BaseCommand<T> {
	static flags = {
		// Test mode flags
		testMode: testModeFlag,
		state: Flags.string({
			description:
				"A state to start in when the command initializes. Used to test the processing of specific states.",
			dependsOn: ["testMode"],
			hidden: true,
		}),
		...BaseCommand.flags,
	};

	/**
	 * The state machine used by the command.
	 */
	abstract get machine(): Machine<unknown>;

	/**
	 * Contextual data that can be passed to state handlers. The type is unknown here; subclasses are expected to
	 * provide a concrete type.
	 */
	abstract get data(): unknown;
	abstract set data(d: unknown);

	/**
	 * The {@link StateHandler} used by the command. Subclasses should set this in their init() method.
	 */
	abstract handler: StateHandler | undefined;

	async init(): Promise<void> {
		await super.init();
		await this.initMachineHooks();
	}

	/**
	 * Wires up some hooks on the state machine to do machine-wide logging.
	 */
	protected async initMachineHooks(): Promise<void> {
		for (const state of this.machine.states()) {
			// Logs the entry into any terminal state, noting the source state and action that caused the transition.
			if (this.machine.state_is_terminal(state) === true) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.machine.hook_entry(state, (o: any) => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					const { from, action } = o;
					this.verbose(`${state}: ${action} from ${from}`);
				});
			}
		}

		// Logs all transitions in the state machine, noting the source and target states and the action that caused the
		// transition.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.machine.hook_any_transition((t: any) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const { action, from, to } = t;
			this.verbose(`STATE MACHINE: ${from} [${action}] ==> ${to}`);
		});
	}

	/**
	 * Loops over the state machine and calls its handler for each machine state. Subclasses should call this at the end
	 * of their `run` method.
	 */
	protected async stateLoop(): Promise<void> {
		const { flags, machine, handler, logger, data } = this;

		if (flags.testMode === true) {
			const machineStates = machine.states();
			if (flags.state !== undefined) {
				if (!machineStates.includes(flags.state)) {
					throw new Error(`State not found in state machine`);
				}

				const handled = await handler?.handleState(
					flags.state,
					machine,
					flags.testMode,
					logger,
					data,
				);

				if (handled === true) {
					this.info(`Test mode: ${flags.state} state handled.`);
					this.exit(100);
				} else {
					this.exit(1);
				}
			}
		} else {
			do {
				const state = machine.state();

				// eslint-disable-next-line no-await-in-loop
				const handled = await handler?.handleState(
					state,
					machine,
					flags.testMode,
					logger,
					data,
				);
				if (handled !== true) {
					this.error(chalk.red(`Unhandled state: ${state}`));
				}

				if (machine.state_is_final(state)) {
					this.verbose(`Exiting. Final state: ${state}`);
					this.exit(0);
				}

				// eslint-disable-next-line no-constant-condition
			} while (true);
		}
	}

	/**
	 * Runs the command by calling the (infinite) stateLoop method.
	 */
	async run(): Promise<void> {
		await this.stateLoop();
	}
}
