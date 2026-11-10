/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Pipelines use this script to save platform-specific package variants to the public azure artifacts feed.
// Experimentally, pnpm's default behavior can exit successfully even if some optional dependencies fail to download.
// This script ensures such failures are reported as a CI failure by processing pnpm's ndjson (newline deliminated json) output.
// Usage: pnpm fetch --ignore-scripts --reporter=ndjson | node scripts/check-pnpm-fetch.cjs
const readline = require("node:readline");
const pending = new Set();
const downloaded = new Set();
readline
	.createInterface({ input: process.stdin })
	.on("line", (line) => {
		const event = JSON.parse(line);
		if (event.level === "warn" || event.level === "error") {
			console.error(event.message ?? event.err?.message ?? line);
		}
		if (event.name !== "pnpm:progress") return;
		if (event.status === "resolved") pending.add(event.packageId);
		if (event.status === "fetched" || event.status === "found_in_store")
			downloaded.add(event.packageId);
	})
	.on("close", () => {
		// pnpm can exit successfully after an optional download fails.
		const missing = [...pending].filter((id) => !downloaded.has(id));
		if (missing.length > 0) {
			console.error("Dependencies could not be fetched:", ...missing);
			process.exitCode = 1;
		}
	});
