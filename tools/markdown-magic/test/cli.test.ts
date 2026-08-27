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

	const { stdout } = await execFileAsync(
		process.execPath,
		[
			"--import",
			"jiti/register",
			"src/index.ts",
			"--files",
			"destination.md",
			"--workingDirectory",
			directory,
		],
		{ cwd: path.resolve(import.meta.dirname, "..") },
	);

	assert.match(stdout, /Updated 1 file\./);
	assert.match(
		await readFile(path.join(directory, "destination.md"), "utf8"),
		/Generated \*\*content\*\*\./,
	);
});
