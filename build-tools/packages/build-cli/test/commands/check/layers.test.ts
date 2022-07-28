/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("layers", () => {
    test.stdout()
        .command(["check layers"])
        .it("Runs basic layer check command", (ctx) => {
            expect(ctx.stdout).contains("Layer check passed");
        });

    // checks for single flags
    test.stdout()
        .command(["check layers", "--md", "."])
        .it("Run layer check command by passing md flag", (ctx) => {
            expect(ctx.stdout).contains("Layer check passed");
        });

    // checks for multiple flags

    // test layer check failures
});
