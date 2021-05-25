/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";

const childArgs: string[] = [
    "./dist/nodeStressTest.js",
    "--driver","tinylicious",
    "--profile","mini",
];

describe("stress test", () => {
    it("Should return 0", async () => {
        const process = child_process.spawn(
            "node",
            childArgs,
            { stdio: "inherit",
            cwd:"../../",
        },
        );
        process.on("exit", (code) => {
            console.log("code",code);
        });
    });
});
