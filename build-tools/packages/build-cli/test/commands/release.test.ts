/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { test } from "@oclif/test";

import { FluidReleaseMachine } from "../../src/machines";

const knownUnhandledStates: string[] = [
    // Known unhandled states can be added here temporarily during development.
];

const machineStates = FluidReleaseMachine.states()
    .filter((s) => !knownUnhandledStates.includes(s))
    .sort();

describe("release command handles all states", () => {
    for (const state of machineStates) {
        test.stdout()
            .command([
                "release",
                "--releaseGroup",
                "build-tools",
                "--bumpType",
                "patch",
                "--testMode",
                "--state",
                state,
                "--verbose",
            ])
            .exit(100)
            .it(`Handles state: '${state}'`, (ctx) => {
                // nothing
            });
    }
});
