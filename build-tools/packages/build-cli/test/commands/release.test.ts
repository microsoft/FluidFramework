/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@oclif/test";
import { FluidReleaseMachineDefinition } from "../../src/machines";

const knownUnhandledStates: string[] = [
    // "AskForReleaseType",
    // "CheckBranchName",
    // "CheckBranchName2",
    // "CheckBranchName3",
    // "CheckBranchUpToDate",
    // "CheckHasRemote",
    // "CheckMainNextIntegrated",
    // "CheckNoPrereleaseDependencies",
    // "CheckNoPrereleaseDependencies2",
    // "CheckNoPrereleaseDependencies3",
    // "CheckPolicy",
    // "CheckReleaseBranchDoesNotExist",
    // "CheckReleaseGroupIsBumped",
    // "CheckReleaseIsDone",
    // "CheckShouldCommitBump",
    // "CheckShouldCommitDeps",
    // "CheckShouldCommitReleasedDepsBump",
    // "CheckShouldRunOptionalChecks",
    // "CheckValidReleaseGroup",
    // "DoBumpReleasedDependencies",
    // "DoMajorRelease",
    // "DoMinorRelease",
    // "DoPatchRelease",
    // "DoReleaseGroupBump",
    // "Failed",
    // "Init",
];
const machineStates = FluidReleaseMachineDefinition.states()
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

// for (const state of machineStates) {
//     // console.log(`HERE!!!`);
//     describe(`Handles ${state}`, async () => {
//         // console.log(`state: ${state}`);
//         test.stdout()
//             .command([
//                 "release",
//                 "--releaseGroup",
//                 "build-tools",
//                 "--bumpType",
//                 "patch",
//                 "--testMode",
//                 "--state",
//                 state,
//                 "-v",
//             ])
//             .exit(100)
//             .it(`Handles state: '${state}'`, (ctx) => {
//                 // ctx.stdout.includes(`Final state: ${state}`);
//             });
//     });
// }
