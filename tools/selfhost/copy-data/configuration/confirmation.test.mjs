/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { confirmIgnoreLogTail } from "./options.mjs";

function prompt(answer) {
	const input = new PassThrough();
	input.isTTY = true;
	const output = new PassThrough();
	let text = "";
	output.on("data", (chunk) => {
		text += chunk.toString();
	});
	const result = confirmIgnoreLogTail({ ignoreLogTail: true }, { input, output });
	input.end(answer);
	return { result, text };
}

test("log-tail override warns and requires an explicit affirmative answer", async () => {
	for (const answer of ["y\n", "Y\n", "yes\n", " YES \n"]) {
		const confirmation = prompt(answer);
		await confirmation.result;
		assert.match(confirmation.text, /WARNING:.*Recent document changes may NOT be copied/);
		assert.match(confirmation.text, /\[y\/N\]/);
	}
});

test("log-tail confirmation defaults to No on empty input, refusal, invalid input, or EOF", async () => {
	for (const answer of ["\n", "n\n", "no\n", "maybe\n", ""]) {
		const confirmation = prompt(answer);
		await assert.rejects(confirmation.result, /Document copy cancelled/);
	}
});

test("ordinary copying does not prompt; a noninteractive override refuses to proceed", async () => {
	const input = new PassThrough();
	const output = new PassThrough();
	let text = "";
	output.on("data", (chunk) => {
		text += chunk.toString();
	});
	await confirmIgnoreLogTail({ ignoreLogTail: false }, { input, output });
	assert.equal(text, "");
	await assert.rejects(
		confirmIgnoreLogTail({ ignoreLogTail: true }, { input, output }),
		/requires interactive confirmation/,
	);
	assert.match(text, /WARNING:/);
	input.end();
	output.end();
});

test("document-copy CLI refuses a noninteractive override before loading configuration", () => {
	const child = spawnSync(
		process.execPath,
		[
			fileURLToPath(new URL("../document-copy/copy.mjs", import.meta.url)),
			"--execute",
			"--ignore-logtail",
			"--config",
			"/nonexistent-copy-data-confirmation-test.json",
		],
		{ encoding: "utf8", timeout: 10_000 },
	);
	assert.equal(child.status, 1, child.stderr);
	assert.match(child.stdout, /WARNING:.*Recent document changes may NOT be copied/);
	assert.match(child.stderr, /requires interactive confirmation/);
	assert.doesNotMatch(child.stderr, /Unable to read.*config/);
});
