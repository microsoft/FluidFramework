/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

const test_tags = [
    "client_v2.0.0-internal.1.0.0",
    "client_v1.2.4",
    "client_v1.2.3",
    "build-tools_v0.5.2002",
    "build-tools_v0.4.2001",
    "build-tools_v0.4.2000",
    "build-tools_v0.4.1000",
    "build-tools_v0.3.2000",
];

describe("release", () => {
    test.stdout()
        .command([
            "release",
            "--releaseGroup",
            "build-tools",
            "--bumpType",
            "patch",
            "--testMode",
            "--state",
            "Failed"
        ])
        .it("Starts in Failed state and immediately exits", (ctx) => {
            console.log(ctx.stdout);
            expect(ctx.stdout).to.contain("version=0.4.0-12345");
        });
});
