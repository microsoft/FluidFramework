/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

if (process.env.PAGEFIND_SEARCH !== "true") {
	console.log("Skipping Pagefind index generation. Set PAGEFIND_SEARCH=true to enable it.");
	process.exit(0);
}

const result = spawnSync("pagefind", ["--site", "build"], {
	shell: process.platform === "win32",
	stdio: "inherit",
});

if (result.error !== undefined) {
	console.error(result.error.message);
}

process.exit(result.status ?? 1);
