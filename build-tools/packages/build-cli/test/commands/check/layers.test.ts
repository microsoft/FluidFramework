/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("layers", () => {
    test.stdout()
        .command(["check layers"])
        .it("Runs basic layer check command", (ctx) => {
            expect(ctx.stdout).contains("Layer check passed ");
        });

    // checks for single flags
    test.stdout()
        .command(["check layers", "--md", "."])
        .it("Run layer check command by passing md flag", (ctx) => {
            expect(ctx.stdout).contains("Layer check passed ");
        });

    // test.stdout()
    //     .command(["check layers", "--dot", ""])
    //     .it("Run layer check command by passing dot flag", (ctx) => {
    //         // expect(ctx.stdout).to.contain("Layer check passed (170 packages)");
    //         expect(ctx.stdout);
    //     });

    // test.stdout()
    //     .command(["check layers", "--info", ""])
    //     .it("Run layer check command by passing info flag", (ctx) => {
    //         // expect(ctx.stdout).to.contain("Layer check passed (170 packages)");
    //         expect(ctx.stdout);
    //     });

    // test.stdout()
    //     .command(["check layers", "--logtime", ""])
    //     .it("Run layer check command by passing logtime flag", (ctx) => {
    //         // expect(ctx.stdout).to.contain("Layer check passed (170 packages)");
    //         expect(ctx.stdout);
    //     });

    // // checks for multiple flags
    // test.stdout()
    //     .command(["check layers", "--md", ".", "--info", ""])
    //     .it("Run layer check command by multiple flags", (ctx) => {
    //         // expect(ctx.stdout).to.contain("Layer check passed (170 packages)");
    // });

    // test layer check failures
});
