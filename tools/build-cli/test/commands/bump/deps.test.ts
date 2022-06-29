/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("deps", () => {
    test.stdout()
        .command(["bump:deps"])
        .exit(100)
        // .it("exits with code 100");
        .it("runs bump:deps", (ctx) => {
            expect(ctx.stdout).to.contain("hello from deps");
        });
});
