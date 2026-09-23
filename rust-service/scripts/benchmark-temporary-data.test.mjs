/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { createTemporaryBenchmarkData } from "./benchmark-temporary-data.mjs";

test("creates and removes owned benchmark data under /tmp", () => {
	const data = createTemporaryBenchmarkData("benchmark-data-test");
	assert.equal(data.provenance.root, "/tmp");
	assert.equal(data.provenance.temporary, true);
	assert.ok(data.path.startsWith("/tmp/benchmark-data-test-"));
	assert.ok(existsSync(data.path));
	data.remove();
	assert.equal(existsSync(data.path), false);
	data.remove();
});

test("rejects unsafe temporary directory prefixes", () => {
	assert.throws(() => createTemporaryBenchmarkData("../outside"), /temporary data prefix/u);
	assert.throws(() => createTemporaryBenchmarkData("nested/path"), /temporary data prefix/u);
});

test("removes owned data when the runner exits before explicit cleanup", () => {
	const helper = new URL("./benchmark-temporary-data.mjs", import.meta.url).href;
	const child = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`import { createTemporaryBenchmarkData } from ${JSON.stringify(helper)}; console.log(createTemporaryBenchmarkData("benchmark-exit-test").path);`,
		],
		{ encoding: "utf8" },
	);
	assert.equal(child.status, 0, child.stderr);
	const path = child.stdout.trim();
	assert.ok(path.startsWith("/tmp/benchmark-exit-test-"));
	assert.equal(existsSync(path), false);
});
