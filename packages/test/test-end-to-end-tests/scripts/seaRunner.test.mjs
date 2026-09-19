/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import test from "node:test";

import { withSeaServer } from "./seaRunner.mjs";

for (const scenario of [
	"success",
	"startup failure",
	"test failure",
	"readiness timeout",
	"interruption",
]) {
	test(`SEA runner cleans up after ${scenario}`, { timeout: 15_000 }, async () => {
		let directory;
		let child;
		let ranTests = false;
		const run = withSeaServer(
			async (temporaryDirectory, marker) => {
				directory = temporaryDirectory;
				const source =
					scenario === "startup failure"
						? "process.exit(7)"
						: `const fs = require('node:fs');
				${scenario === "readiness timeout" ? "" : "console.log('WEBSOCKET_URL=ws://127.0.0.1:12345/sea/websocket');"}
				setInterval(() => { if (fs.existsSync(${JSON.stringify(marker)})) process.exit(0); }, 10);`;
				child = spawn(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "pipe"] });
				return child;
			},
			async (endpoint) => {
				ranTests = true;
				assert.equal(endpoint, "ws://127.0.0.1:12345/sea/websocket");
				if (scenario === "test failure") throw new Error("test failed");
				if (scenario === "interruption") process.emit("SIGTERM");
			},
			500,
		);
		if (scenario === "success") await run;
		else
			await assert.rejects(
				run,
				scenario === "startup failure"
					? /before readiness/
					: scenario === "test failure"
						? /test failed/
						: scenario === "interruption"
							? /interrupted/
							: /readiness timed out/,
			);
		assert.equal(ranTests, ["success", "test failure", "interruption"].includes(scenario));
		assert(child.exitCode !== null || child.signalCode !== null);
		await assert.rejects(access(directory), { code: "ENOENT" });
	});
}
