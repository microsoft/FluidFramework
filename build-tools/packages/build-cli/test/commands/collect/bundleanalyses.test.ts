/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect, test } from "@oclif/test";

describe("collect/bundleanalyses", () => {
    test.stdout()
        .command(["collect/bundleanalyses"])
        .it("runs hello", (ctx) => {
            expect(ctx.stdout).to.contain("hello world");
        });

    test.stdout()
        .command(["collect/bundleanalyses", "--name", "jeff"])
        .it("runs hello --name jeff", (ctx) => {
            expect(ctx.stdout).to.contain("hello jeff");
        });
});
