/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { FluidReleaseMachine as machine } from "../../src/machines/fluidReleaseMachine";

describe("FluidReleaseMachine", () => {
    it("DoPatchRelease states", () => {
        // const state = machine.state();
        // console.log(`state: ${state}`);
        const states = new Set<string>();
        let state = `DoPatchRelease`;
        walkExits(state, states);
        console.log(JSON.stringify([...states]));
    });

    it("DoMinorRelease states", () => {
        // const state = machine.state();
        // console.log(`state: ${state}`);
        const states = new Set<string>();
        let state = `DoMinorRelease`;
        walkExits(state, states);
        console.log(JSON.stringify([...states]));
    });

    it("DoMajorRelease states", () => {
        // const state = machine.state();
        // console.log(`state: ${state}`);
        const states = new Set<string>();
        let state = `DoMajorRelease`;
        walkExits(state, states);
        console.log(JSON.stringify([...states]));
    });
});

function walkExits(state: string, collector: Set<string>, step = 0): void {
    // console.log(`state: ${state}`);
    collector.add(state);
    if (machine.state_is_terminal(state)) {
        return;
    }

    const transitions = machine.list_transitions(state);
    // console.log(JSON.stringify(transitions));

    for (const next of transitions.exits) {
        walkExits(next, collector, step++);
    }
}
