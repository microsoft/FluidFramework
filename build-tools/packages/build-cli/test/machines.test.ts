/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { difference } from "../src/lib/sets";
import { actionDescriptions, stateDescriptions } from "../src/machines/descriptions";
import { allMachines, UnifiedReleaseMachine } from "../src/machines";

describe("UnifiedReleaseMachine", () => {
    const machine = UnifiedReleaseMachine;
    const machineStates = new Set(machine.machine.states());
    const machineActions = new Set(machine.machine.list_actions());

    it("all machine states are known", () => {
        const knownStates = new Set(machine.knownStates);
        const diff = difference(machineStates, knownStates);

        assert.equal(diff.size, 0, `Unknown states: ${[...diff].join(", ")}`);
    });

    it("all known states are machine states", () => {
        const knownStates = new Set(machine.knownStates);
        const diff = difference(knownStates, machineStates);

        assert.equal(diff.size, 0, `States that have no machine state: ${[...diff].join(", ")}`);
    });

    it("all machine actions are known", () => {
        const knownActions = new Set(machine.knownActions);
        const diff = difference(machineActions, knownActions);

        assert.equal(diff.size, 0, `Unknown actions: ${[...diff].join(", ")}`);
    });

    it("all known actions are machine actions", () => {
        const knownActions = new Set(machine.knownActions);
        const diff = difference(knownActions, machineActions);

        assert.equal(diff.size, 0, `Actions that have no machine action: ${[...diff].join(", ")}`);
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
