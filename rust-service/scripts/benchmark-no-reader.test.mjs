/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

test("no-reader fixture receives a new directory inside the runner's owned root", (t) => {
	const root = mkdtempSync("/tmp/sea-no-reader-runner-test-");
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const binary = resolve(root, "fixture.mjs");
	writeFileSync(
		binary,
		`#!/usr/bin/env node
import { mkdirSync } from "node:fs";
mkdirSync(process.argv[3]);
console.log(JSON.stringify({ type: "directory-created", path: process.argv[3] }));
`,
		{ mode: 0o755 },
	);
	const output = resolve(root, "output");
	const child = spawnSync(
		process.execPath,
		[
			resolve(import.meta.dirname, "benchmark-no-reader.mjs"),
			binary,
			"memory",
			"true",
			output,
		],
		{ encoding: "utf8", timeout: 10_000 },
	);
	assert.equal(child.error, undefined);
	// This fixture stops before measurement; the runner must still clean up its owned root.
	assert.equal(child.status, 1, child.stderr);
	const log = readFileSync(resolve(output, "service.log"), "utf8").trim();
	const created = JSON.parse(log);
	assert.equal(created.type, "directory-created");
	const result = JSON.parse(readFileSync(resolve(output, "result.json"), "utf8"));
	assert.equal(result.status, "failed");
	assert.match(result.error, /missing measured phase or finite replay/u);
	assert.equal(dirname(created.path), result.serviceData.path);
	assert.equal(existsSync(created.path), false);
	assert.equal(existsSync(result.serviceData.path), false);
});
