/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("bump", () => {
    test.stdout().command(["bump"]).exit(100).it("exits with code 100");

    // test.stdout()
    //     .command(["bump", "--help"])
    //     .it("runs bump --help", (ctx) => {
    //         expect(ctx.stdout).to.contain("Bump versions of packages and dependencies.");
    //     });
});
