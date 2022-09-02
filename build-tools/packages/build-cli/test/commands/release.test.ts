/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";
import { UnifiedReleaseMachineDefinition } from "../../src/machines";

describe("release command handles all states", () => {
    const unhandledStates = ["Init", "Failed"];
    const machineStates = UnifiedReleaseMachineDefinition.states().filter(s=> !unhandledStates.includes(s));
    // const machineStates = [
    //     // "Init",
    //     // "Failed",
    //     // "DoChecks",
    //     // "AskReleaseDetails",
    //     // "CheckValidReleaseGroup",
    //     "CheckPolicy",
    //     "PromptToPRReleasedDepsBump",
    //     // "foo",
    // ];

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
                // expect(ctx.stdout).to.contain("handled:true");
                // expect(ctx.error).to.exist;
            });
    }

    // test.stderr()
    // .command([
    //     "release",
    //     "--releaseGroup",
    //     "build-tools",
    //     "--bumpType",
    //     "patch",
    //     "--testMode",
    //     "--state",
    //     "foo",
    // ])
    // // .exit(1)
    // .it(`Error with unknown state`, (ctx) => {
    //     expect(ctx.stderr).to.contain("State not found in state machine");
    //     // expect(ctx.error).to.exist;
    // });
});
