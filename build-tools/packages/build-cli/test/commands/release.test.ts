/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@oclif/test";
import { FluidReleaseMachineDefinition } from "../../src/machines";

describe("release command handles all states", () => {
    const knownUnhandledStates: string[] = [];
    const machineStates = FluidReleaseMachineDefinition.states().filter(
        (s) => !knownUnhandledStates.includes(s),
    );

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
            ])
            .exit(0)
            .it(`Handles state: '${state}'`, (ctx) => {
                // n/a
            });
    }
});
