/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import assert from "assert";

const childArgs: string[] = [
    "./dist/orchestratorRunner.js",
    "--config", "v1",
    "--profile", "mini",
];

describe("stress test", () => {
    it("Should return 0", async () => {
        const process = child_process.spawn(
            "node",
            childArgs,
            { stdio: "inherit" },
        );
        await new Promise((resolve) => process.once("close", resolve));
        assert.strictEqual(process.exitCode, 0, "exit code is not 0");
    });
});
