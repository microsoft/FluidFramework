/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Machine } from "jssm";

import { CommandLogger } from "../logging";
import { MachineState } from "../machines";
import { BaseStateHandler } from "./stateHandlers";

/**
 * A base class that handles the "Init" and "Failed" states in a state machine. These states are commonly used in state
 * machines so this class serves as a base class for machine-specific handlers.
 */
export abstract class InitFailedStateHandler extends BaseStateHandler {
    /* eslint-disable @typescript-eslint/no-unused-vars */
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
