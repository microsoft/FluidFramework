/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { actionDescriptions, stateDescriptions } from "../src/machines/descriptions";
import { allMachines, UnifiedReleaseMachine } from "../src/machines";

describe("UnifiedReleaseMachine", () => {
    const machine = UnifiedReleaseMachine;
    const machineStates = machine.machine.states();

    // TODO: Once the state handler implementation for UnifiedReleaseMachine is implemented, this test needs to be
    // enabled.
    it.skip("all states are handled", async () => {
        for (const state of machineStates) {
            const result = await machine.handleState(state);
            if (result === false || result === undefined) {
                console.log(`Unhandled state: ${state}`);
            }
            assert.isTrue(result);
        }
    });
});

describe("states and actions are described", () => {
    const machineActions = new Set<string>();
    const machineStates = new Set<string>();

    for (const m of allMachines) {
        for (const action of m.machine.list_actions()) {
            machineActions.add(action);
        }
        for (const state of m.machine.states()) {
            machineStates.add(state);
        }
    }

    it("all actions are described", () => {
        const undescribedActions = [...machineActions].filter((s) => !actionDescriptions.has(s));

        assert.equal(
            undescribedActions.length,
            0,
            `Unknown states: ${[...undescribedActions].join(", ")}`,
        );
    });

    it("all described actions are machine actions", () => {
        const actions = [...actionDescriptions.keys()].filter((s) => !machineActions.has(s));

        assert.equal(actions.length, 0, `Unknown states: ${[...actions].join(", ")}`);
    });

    it("all states are described", () => {
        const undescribedStates = [...machineStates].filter((s) => !stateDescriptions.has(s));

        assert.equal(
            undescribedStates.length,
            0,
            `Unknown states: ${[...undescribedStates].join(", ")}`,
        );
    });

    it("all described states are machine states", () => {
        const states = [...stateDescriptions.keys()].filter((s) => !machineStates.has(s));

        assert.equal(states.length, 0, `Unknown states: ${[...states].join(", ")}`);
    });
});
