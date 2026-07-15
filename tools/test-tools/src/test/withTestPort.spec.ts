/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withTestPort } from "../withTestPort";

/**
 * A small Node script that records the `PORT` environment variable and its CLI arguments to the JSON
 * file passed as its first argument. Used to observe what `withTestPort` passes to the spawned command.
 */
const probeScript = `const fs = require("node:fs");
fs.writeFileSync(process.argv[2], JSON.stringify({ port: process.env.PORT, args: process.argv.slice(3) }));
`;

interface ProbeOutput {
	port?: string;
	args: string[];
}

describe("withTestPort", () => {
	// Use a unique package name that won't appear in any generated port map, so `getTestPort` returns
	// its default port deterministically regardless of any testportmap.json left on the machine.
	const packageName = `@fluid-test/with-test-port-${process.pid}`;
	const defaultPort = "8081";

	let originalCwd: string;
	let tempDir: string;
	let probePath: string;
	let outPath: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "with-test-port-"));
		fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: packageName }));
		probePath = path.join(tempDir, "probe.cjs");
		outPath = path.join(tempDir, "out.json");
		fs.writeFileSync(probePath, probeScript);
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	function readProbeOutput(): ProbeOutput {
		return JSON.parse(fs.readFileSync(outPath, "utf8")) as ProbeOutput;
	}

	it("returns a non-zero exit code when no command is provided", () => {
		assert.equal(withTestPort([]), 1);
	});

	it("returns a non-zero exit code when the package name can't be determined", () => {
		// Remove the package.json so the name lookup fails before anything is spawned.
		fs.rmSync(path.join(tempDir, "package.json"));
		assert.equal(withTestPort(["node", probePath, outPath]), 1);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("exports the resolved port to the command as the PORT environment variable", () => {
		const code = withTestPort(["node", probePath, outPath]);
		assert.equal(code, 0);
		assert.equal(readProbeOutput().port, defaultPort);
	});

	it("substitutes {PORT} tokens in the command arguments", () => {
		const code = withTestPort(["node", probePath, outPath, "{PORT}", "prefix-{PORT}"]);
		assert.equal(code, 0);
		assert.deepEqual(readProbeOutput().args, [defaultPort, `prefix-${defaultPort}`]);
	});

	it("uses the --fallback value when no port is assigned", () => {
		const code = withTestPort(["--fallback", "7070", "node", probePath, outPath, "{PORT}"]);
		assert.equal(code, 0);
		const output = readProbeOutput();
		assert.equal(output.port, "7070");
		assert.deepEqual(output.args, ["7070"]);
	});

	it("returns a non-zero exit code for a non-numeric --fallback value", () => {
		assert.equal(withTestPort(["--fallback", "nope", "node", probePath, outPath]), 1);
		assert.equal(fs.existsSync(outPath), false, "the command should not have run");
	});

	it("uses the port assigned by assign-test-ports when a mapping exists", () => {
		const mapPath = path.join(os.tmpdir(), "testportmap.json");
		const backup = fs.existsSync(mapPath) ? fs.readFileSync(mapPath) : undefined;
		try {
			fs.writeFileSync(mapPath, JSON.stringify({ [packageName]: 12345 }));
			const code = withTestPort(["node", probePath, outPath, "{PORT}"]);
			assert.equal(code, 0);
			const output = readProbeOutput();
			assert.equal(output.port, "12345");
			assert.deepEqual(output.args, ["12345"]);
		} finally {
			if (backup === undefined) {
				fs.rmSync(mapPath, { force: true });
			} else {
				fs.writeFileSync(mapPath, backup);
			}
		}
	});

	it("propagates the exit code of the spawned command", () => {
		const failPath = path.join(tempDir, "fail.cjs");
		fs.writeFileSync(failPath, "process.exit(7);\n");
		assert.equal(withTestPort(["node", failPath]), 7);
	});
});
