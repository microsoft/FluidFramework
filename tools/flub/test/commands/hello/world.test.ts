/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("hello world", () => {
    test.stdout()
        .command(["hello:world"])
        .it("runs hello world cmd", (ctx) => {
            expect(ctx.stdout).to.contain("hello world!");
        });
});
