/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withTestPort } from "../withTestPort";

describe("withTestPort", () => {
	// Use a unique package name that won't appear in any generated port map, so `getTestPort` returns
	// its default port deterministically regardless of any testportmap.json left on the machine.
	const packageName = `@fluid-test/with-test-port-${process.pid}`;
	const defaultPort = "8081";

	let originalCwd: string;
	let tempDir: string;
	let outPath: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "with-test-port-"));
		fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: packageName }));
		outPath = path.join(tempDir, "out.txt");
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/** Reads (and trims) the file the spawned command redirected its output to. */
	function readOutput(): string {
		return fs.readFileSync(outPath, "utf8").trim();
	}

	it("returns a non-zero exit code when no command is provided", () => {
		assert.equal(withTestPort([]), 1);
	});

	it("returns a non-zero exit code when the package name can't be determined", () => {
		// Remove the package.json so the name lookup fails before anything is spawned.
		fs.rmSync(path.join(tempDir, "package.json"));
		assert.equal(withTestPort(["echo", "hi", ">", outPath]), 1);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("exports the resolved port to the command as the PORT environment variable", () => {
		assert.equal(withTestPort(["node", "-p", "process.env.PORT", ">", outPath]), 0);
		assert.equal(readOutput(), defaultPort);
	});

	it("substitutes {PORT} tokens in the command arguments", () => {
		assert.equal(withTestPort(["echo", "{PORT}", "prefix-{PORT}", ">", outPath]), 0);
		assert.equal(readOutput(), `${defaultPort} prefix-${defaultPort}`);
	});

	it("uses the --fallback value when no port is assigned", () => {
		assert.equal(withTestPort(["--fallback", "7070", "echo", "{PORT}", ">", outPath]), 0);
		assert.equal(readOutput(), "7070");
	});

	it("returns a non-zero exit code for a non-numeric --fallback value", () => {
		assert.equal(withTestPort(["--fallback", "nope", "echo", "hi", ">", outPath]), 1);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("uses the port assigned by assign-test-ports when a mapping exists", () => {
		const mapPath = path.join(os.tmpdir(), "testportmap.json");
		const backup = fs.existsSync(mapPath) ? fs.readFileSync(mapPath) : undefined;
		try {
			fs.writeFileSync(mapPath, JSON.stringify({ [packageName]: 12345 }));
			assert.equal(withTestPort(["echo", "{PORT}", ">", outPath]), 0);
			assert.equal(readOutput(), "12345");
		} finally {
			if (backup === undefined) {
				fs.rmSync(mapPath, { force: true });
			} else {
				fs.writeFileSync(mapPath, backup);
			}
		}
	});

	it("propagates the exit code of the spawned command", () => {
		assert.equal(withTestPort(["exit", "7"]), 7);
	});
});
