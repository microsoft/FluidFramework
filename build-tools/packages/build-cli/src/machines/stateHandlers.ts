import type { Machine } from "jssm";
import { CommandLogger } from "../logging";
import { InstructionalPromptWriter } from "../instructionalPromptWriter";
import { MachineState } from "./machineState";

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
export abstract class BaseStateHandler extends InstructionalPromptWriter implements StateHandler {
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
    ) {
        super();
    }

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

/**
 * A base class that handles the "Init" and "Failed" states in a state machine. These states are commonly used in state
 * machines so this class serves as a base class for machine-specific handlers.
 */
export abstract class InitFailedStateHandler extends BaseStateHandler {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    // eslint-disable-next-line max-params
    async handleState(
        state: MachineState,
        machine: Machine<unknown>,
        testMode: boolean,
        log: CommandLogger,
        data: unknown,
    ): Promise<boolean> {
        /* eslint-enable @typescript-eslint/no-unused-vars */
        switch (state) {
            case "Init": {
                if (testMode) {
                    return true;
                }

                BaseStateHandler.signalSuccess(machine, state);
                break;
            }

            case "Failed": {
                if (testMode) {
                    return true;
                }

                throw new Error(`Entered final state: ${state}`);
            }

            default: {
                return false;
            }
        }

        return true;
    }
}
