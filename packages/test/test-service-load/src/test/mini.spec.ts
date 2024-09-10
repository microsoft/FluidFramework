/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import child_process from "child_process";

const childArgs: string[] = ["./dist/main.js", "--driver", "tinylicious", "--profile", "mini"];

describe("stress test", () => {
	it("Should return 0", async () => {
		const process = child_process.spawn("node", childArgs, { stdio: "inherit" });
		await new Promise((resolve) => process.once("close", resolve));
		assert.strictEqual(process.exitCode, 0, "exit code is not 0");
	});
});
