/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = path.resolve(import.meta.dirname, "..");

async function runCli(directory: string, file = "destination.md") {
	return execFileAsync(
		process.execPath,
		[
			"--import",
			"jiti/register",
			"src/index.ts",
			"--files",
			file,
			"--workingDirectory",
			directory,
		],
		{ cwd: packageDirectory },
	);
}

test("CLI processes selected files from the working directory", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "markdown-magic-cli-"));
	await writeFile(path.join(directory, "source.md"), "Generated **content**.\n");
	await writeFile(
		path.join(directory, "destination.md"),
		[
			`<!-- markdown-magic:begin {"transform":"include","path":"./source.md"} -->`,
			"",
			"Old content.",
			"",
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);

	const { stdout } = await runCli(directory);

	assert.match(stdout, /Updated 1 file\./);
	assert.match(
		await readFile(path.join(directory, "destination.md"), "utf8"),
		/Generated \*\*content\*\*\./,
	);
});

test("CLI reports an unknown transform as an error", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "markdown-magic-cli-"));
	const destinationPath = path.join(directory, "destination.md");
	const source = [
		`<!-- markdown-magic:begin {"transform":"unknown"} -->`,
		"",
		"Old content.",
		"",
		"<!-- markdown-magic:end -->",
	].join("\n");
	await writeFile(destinationPath, source);

	await assert.rejects(runCli(directory), (error: unknown) => {
		assert(error instanceof Error);
		assert("code" in error);
		assert.equal(error.code, 1);
		assert("stdout" in error && typeof error.stdout === "string");
		assert.doesNotMatch(error.stdout, /Updated \d+ files?\./);
		assert("stderr" in error && typeof error.stderr === "string");
		assert.match(error.stderr, /destination\.md:1: Unknown transform "unknown"/);
		return true;
	});
	assert.equal(await readFile(destinationPath, "utf8"), source);
});

test("CLI does not write a file when a later transform has invalid options", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "markdown-magic-cli-"));
	const destinationPath = path.join(directory, "destination.md");
	const source = [
		`<!-- markdown-magic:begin {"transform":"help"} -->`,
		"",
		"Old help content.",
		"",
		"<!-- markdown-magic:end -->",
		"",
		`<!-- markdown-magic:begin {"transform":"include"} -->`,
		"",
		"Old include content.",
		"",
		"<!-- markdown-magic:end -->",
	].join("\n");
	await writeFile(destinationPath, source);

	await assert.rejects(runCli(directory), (error: unknown) => {
		assert(error instanceof Error);
		assert("code" in error);
		assert.equal(error.code, 1);
		assert("stdout" in error && typeof error.stdout === "string");
		assert.doesNotMatch(error.stdout, /Updated \d+ files?\./);
		assert("stderr" in error && typeof error.stderr === "string");
		assert.match(error.stderr, /Option "path" must be a non-empty string/);
		return true;
	});
	assert.equal(await readFile(destinationPath, "utf8"), source);
});
