/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../trust-policy.js", import.meta.url));

test("rejects non-exact specs, unknown flags, and invalid options before network access", async () => {
	for (const args of [
		["--package", "example@latest"],
		["--package", "example@v1.0.0"],
		["--package", "example@1.0.0", "--path", process.cwd()],
		["--package", "example@1.0.0", "--policy", "unsafe"],
		["--policy", "metadata"],
		["--package", "example@1.0.0", "--max-candidates", "0"],
	]) {
		await assert.rejects(
			exec(process.execPath, [cli, ...args, "--no-registry-check", "--json"]),
		);
	}
});

test("rejects Azure Artifacts registries before any trust check without printing credentials", async () => {
	const feed = "https://user:secret@pkgs.dev.azure.com/o/_packaging/f/npm/registry/";
	await assert.rejects(
		exec(process.execPath, [
			cli,
			"--package",
			"example@1.0.0",
			"--registry",
			feed,
			"--no-registry-check",
		]),
		(error: { stderr: string }) => {
			// oclif wraps error messages and prefixes continuation lines with "»".
			assert.match(error.stderr.replace(/\s+(»\s+)?/g, " "), /is an Azure Artifacts feed/);
			assert.doesNotMatch(error.stderr, /secret/);
			return true;
		},
	);
});
