/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withTestPort as withTestPortBase } from "../withTestPort";

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

	/** Runs `withTestPort`, capturing anything it logs to `console.error`. */
	function withTestPort(argv: string[]): { code: number; errors: string[] } {
		const errors: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]): void => {
			errors.push(args.map(String).join(" "));
		};
		try {
			return { code: withTestPortBase(argv), errors };
		} finally {
			console.error = original;
		}
	}

	it("returns a non-zero exit code and logs an error when no command is provided", () => {
		const { code, errors } = withTestPort([]);
		assert.equal(code, 1);
		assert.deepEqual(errors, ["with-test-port: no command was provided to run."]);
	});

	it("returns a non-zero exit code and logs an error when the package name can't be determined", () => {
		// Remove the package.json so the name lookup fails before anything is spawned.
		fs.rmSync(path.join(tempDir, "package.json"));
		const { code, errors } = withTestPort(["echo", "hi", ">", outPath]);
		assert.equal(code, 1);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /^with-test-port: unable to determine the package name:/);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("exports the resolved port to the command as the PORT environment variable", () => {
		const { code, errors } = withTestPort(["node", "-p", "process.env.PORT", ">", outPath]);
		assert.equal(code, 0);
		assert.deepEqual(errors, []);
		assert.equal(readOutput(), defaultPort);
	});

	describe("substitutes {PORT} tokens in the command arguments", () => {
		it("replaces a standalone {PORT} argument", () => {
			const { code, errors } = withTestPort(["echo", "{PORT}", ">", outPath]);
			assert.equal(code, 0);
			assert.deepEqual(errors, []);
			assert.equal(readOutput(), defaultPort);
		});

		it("replaces a {PORT} token embedded within an argument", () => {
			const { code, errors } = withTestPort(["echo", "prefix-{PORT}", ">", outPath]);
			assert.equal(code, 0);
			assert.deepEqual(errors, []);
			assert.equal(readOutput(), `prefix-${defaultPort}`);
		});
	});

	it("uses the --fallback value when no port is assigned", () => {
		const { code, errors } = withTestPort(["--fallback", "7070", "echo", "{PORT}", ">", outPath]);
		assert.equal(code, 0);
		assert.deepEqual(errors, []);
		assert.equal(readOutput(), "7070");
	});

	it("returns a non-zero exit code and logs an error for a non-numeric --fallback value", () => {
		const { code, errors } = withTestPort(["--fallback", "nope", "echo", "hi", ">", outPath]);
		assert.equal(code, 1);
		assert.deepEqual(errors, ["with-test-port: --fallback requires a numeric value."]);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("uses the port assigned by assign-test-ports when a mapping exists", () => {
		const mapPath = path.join(os.tmpdir(), "testportmap.json");
		const backup = fs.existsSync(mapPath) ? fs.readFileSync(mapPath) : undefined;
		try {
			fs.writeFileSync(mapPath, JSON.stringify({ [packageName]: 12345 }));
			const { code, errors } = withTestPort(["echo", "{PORT}", ">", outPath]);
			assert.equal(code, 0);
			assert.deepEqual(errors, []);
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
		const { code, errors } = withTestPort(["exit", "7"]);
		assert.equal(code, 7);
		assert.deepEqual(errors, []);
	});
});
