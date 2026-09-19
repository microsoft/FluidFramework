/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { withSeaServer } from "./seaRunner.mjs";

test("default integration tests include local, Tinylicious, and SEA", async () => {
	const { scripts } = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	assert.equal(scripts.test, "npm run test:realsvc");
	assert.equal(
		scripts["test:realsvc"],
		"npm run test:realsvc:local && npm run test:realsvc:tinylicious && npm run test:realsvc:sea",
	);
	assert.equal(scripts["test:realsvc:sea"], "node scripts/seaRunner.mjs");
});

test("CI runs the SEA report script without stopping at the first failure", async () => {
	const { scripts } = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	const { scripts: rootScripts } = JSON.parse(
		await readFile(new URL("../../../../package.json", import.meta.url), "utf8"),
	);
	assert.equal(scripts["test:realsvc:sea:report"], "npm run test:realsvc:sea -- --no-bail");
	assert.equal(
		rootScripts["ci:test:realsvc:sea"],
		"pnpm run -r --no-sort --stream --no-bail test:realsvc:sea:report",
	);
});

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
