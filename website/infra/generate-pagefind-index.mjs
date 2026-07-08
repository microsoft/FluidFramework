/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync("pagefind", ["--site", "build"], {
	shell: process.platform === "win32",
	stdio: "inherit",
});

if (result.error !== undefined) {
	console.error(result.error.message);
}

process.exit(result.status ?? 1);
