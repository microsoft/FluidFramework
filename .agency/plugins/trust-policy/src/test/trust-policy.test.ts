/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
	collectPinnedVersions,
	extractTrustViolations,
	findWorkspace,
	runPnpm,
} from "../trust-policy.js";

interface FixtureResponse {
	code: number;
	stdout?: string;
	stderr?: string;
}

interface PnpmCall {
	args: string[];
	cwd: string;
	ci: string;
}

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../run.js", import.meta.url));
const registryPackage = (name: string, version: string) => ({
	from: name,
	version,
	resolved: `https://registry.npmjs.org/${name}/-/${version}.tgz`,
});
const downgrade = (name: string, version: string): string =>
	JSON.stringify({ code: "ERR_PNPM_TRUST_DOWNGRADE", package: { name, version } });
const listResponse = {
	code: 0,
	stdout: JSON.stringify([
		{
			dependencies: {
				alias: registryPackage("example", "1.0.0"),
				example: registryPackage("example", "2.0.0"),
				scoped: registryPackage("@scope/example", "1.0.0"),
			},
		},
	]),
};

async function fixture(t: TestContext, responses: FixtureResponse[] = []) {
	const root = await mkdtemp(path.join(os.tmpdir(), "trust-policy test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const workspace = path.join(root, "workspace");
	const bin = path.join(root, "bin");
	await mkdir(workspace);
	await mkdir(bin);
	await writeFile(path.join(workspace, "package.json"), '{"private":true}');
	await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - '.'\n");
	const state = path.join(root, "responses.json");
	const calls = path.join(root, "calls.jsonl");
	await writeFile(state, JSON.stringify(responses));
	const fakePnpm = path.join(bin, "fake-pnpm.cjs");
	await writeFile(
		fakePnpm,
		`const fs = require("node:fs");
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), ci: process.env.CI}) + "\\n");
const responses = JSON.parse(fs.readFileSync(process.env.TEST_RESPONSES, "utf8"));
const response = responses.shift();
if (!response) throw new Error("Unexpected pnpm invocation");
fs.writeFileSync(process.env.TEST_RESPONSES, JSON.stringify(responses));
process.stdout.write(response.stdout || "");
process.stderr.write(response.stderr || "");
process.exitCode = response.code;
`,
	);
	if (process.platform === "win32") {
		await writeFile(path.join(bin, "pnpm.cmd"), `@"${process.execPath}" "${fakePnpm}" %*\r\n`);
	} else {
		await writeFile(
			path.join(bin, "pnpm"),
			`#!/bin/sh\nexec "${process.execPath}" "${fakePnpm}" "$@"\n`,
			{ mode: 0o755 },
		);
	}
	const env: NodeJS.ProcessEnv = {
		...process.env,
		TEST_RESPONSES: state,
		TEST_CALLS: calls,
	};
	const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
	env[pathKey] = `${bin}${path.delimiter}${env[pathKey] ?? ""}`;
	async function run(args: string[] = []) {
		try {
			const result = await exec(process.execPath, [cli, "--path", workspace, ...args], {
				env,
				cwd: root,
			});
			return { ...result, code: 0 };
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!("code" in error) ||
				typeof error.code !== "number" ||
				!("stdout" in error) ||
				typeof error.stdout !== "string" ||
				!("stderr" in error) ||
				typeof error.stderr !== "string"
			) {
				throw error;
			}
			return { stdout: error.stdout, stderr: error.stderr, code: error.code };
		}
	}
	async function readCalls(): Promise<PnpmCall[]> {
		return (await readFile(calls, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as PnpmCall);
	}
	return { root, workspace, run, readCalls };
}

test("collects real registry names recursively across all dependency kinds", () => {
	const result = collectPinnedVersions(
		JSON.stringify([
			{
				dependencies: {
					alias: {
						...registryPackage("@scope/real", "1.0.0"),
						optionalDependencies: { nested: registryPackage("nested", "2.0.0") },
					},
					local: { from: "local", version: "link:../local" },
					git: { from: "git", version: "abc", resolved: "git+https://example.com" },
				},
				devDependencies: { duplicate: registryPackage("nested", "2.0.0") },
				peerDependencies: { peer: registryPackage("peer", "3.0.0") },
			},
		]),
	);
	assert.deepEqual(result, [
		{ name: "@scope/real", version: "1.0.0" },
		{ name: "nested", version: "2.0.0" },
		{ name: "peer", version: "3.0.0" },
	]);
});

test("parses CRLF events and rejects malformed trust-policy events", () => {
	assert.deepEqual(extractTrustViolations(`{}\r\n${downgrade("example", "1.0.0")}\r\n`), [
		{ name: "example", version: "1.0.0" },
	]);
	assert.throws(() => extractTrustViolations("ERR_PNPM_TRUST_DOWNGRADE"), /parse/);
	assert.throws(
		() => extractTrustViolations('{"code":"OTHER","message":"ERR_PNPM_TRUST_DOWNGRADE"}'),
		/did not match/,
	);
	assert.throws(
		() => extractTrustViolations('{"code":"ERR_PNPM_TRUST_DOWNGRADE"}'),
		/without a package/,
	);
});

test("selects the nearest nested workspace and supports standalone packages", async (t) => {
	const { workspace } = await fixture(t);
	const nested = path.join(workspace, "nested");
	const child = path.join(nested, "child");
	await mkdir(child, { recursive: true });
	await writeFile(path.join(nested, "package.json"), "{}");
	assert.equal(await findWorkspace(child), workspace);
	await writeFile(path.join(nested, "pnpm-workspace.yaml"), "packages: []\n");
	assert.equal(await findWorkspace(child), nested);
	await rm(path.join(nested, "pnpm-workspace.yaml"));
	await rm(path.join(workspace, "pnpm-workspace.yaml"));
	assert.equal(await findWorkspace(child), nested);
});

test("explicit Yarn lockfiles bypass pnpm list and support scoped registry aliases", async (t) => {
	const { root, run, readCalls } = await fixture(t, [{ code: 0 }]);
	const lock = path.join(root, "yarn.lock");
	await writeFile(
		lock,
		'# yarn lockfile v1\n"alias@npm:@scope/real@^1":\n  version "1.2.3"\n  resolved "https://registry.npmjs.org/@scope/real/-/real-1.2.3.tgz"\n',
	);
	const output = await run(["--lockfile", lock, "--json", "--keep"]);
	assert.equal(output.code, 0, output.stdout + output.stderr);
	const result = JSON.parse(output.stdout);
	assert.equal(result.totalUniqueDependencies, 1);
	const calls = await readCalls();
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.args[0], "install");
	const manifest = JSON.parse(
		await readFile(path.join(result.tempDir, "projects", "0", "package.json"), "utf8"),
	);
	assert.deepEqual(manifest.dependencies, { "@scope/real": "1.2.3" });
});

test("accumulates violations, preserves union selectors, and writes real names", async (t) => {
	const { workspace, run, readCalls } = await fixture(t, [
		listResponse,
		{ code: 1, stdout: downgrade("example", "2.0.0") },
		{ code: 1, stdout: downgrade("example", "1.0.0") },
		{ code: 1, stdout: downgrade("@scope/example", "1.0.0") },
		{ code: 0 },
	]);
	const output = await run(["--json", "--keep", "--verbose"]);
	assert.equal(output.code, 0, output.stderr);
	const result = JSON.parse(output.stdout);
	assert.equal(result.iterations, 4);
	assert.equal(result.totalUniqueDependencies, 3);
	assert.equal(result.auditIncomplete, false);
	assert.deepEqual(result.violations, [
		{ name: "@scope/example", version: "1.0.0" },
		{ name: "example", version: "1.0.0" },
		{ name: "example", version: "2.0.0" },
	]);
	const calls = await readCalls();
	const firstCall = calls[0];
	assert.ok(firstCall);
	assert.deepEqual(firstCall.args, ["list", "--recursive", "--json", "--depth", "Infinity"]);
	assert.equal(firstCall.cwd, workspace);
	assert.ok(calls.every((call) => call.ci === "1"));
	const lastCall = calls.at(-1);
	assert.ok(lastCall);
	assert.deepEqual(lastCall.args.slice(-4), [
		"--trust-policy-exclude",
		"@scope/example@1.0.0",
		"--trust-policy-exclude",
		"example@1.0.0||2.0.0",
	]);
	assert.ok(lastCall.args.includes("--lockfile-only"));
	const manifest = JSON.parse(
		await readFile(path.join(result.tempDir, "projects", "0", "package.json"), "utf8"),
	);
	assert.deepEqual(manifest.dependencies, { example: "1.0.0" });
});

test("stops repeated violations as incomplete and removes scratch files", async (t) => {
	const { workspace, run } = await fixture(t, [
		listResponse,
		{ code: 1, stdout: downgrade("example", "1.0.0") },
		{ code: 1, stdout: downgrade("example", "1.0.0") },
	]);
	const output = await run(["--json"]);
	assert.equal(output.code, 0, output.stderr);
	const result = JSON.parse(output.stdout);
	assert.equal(result.auditIncomplete, true);
	assert.equal(result.iterations, 2);
	await assert.rejects(stat(path.join(workspace, ".trust-audit-temp")), { code: "ENOENT" });
});

test("text mode fails for violations and for non-policy install errors", async (t) => {
	for (const responses of [
		[listResponse, { code: 1, stdout: downgrade("example", "1.0.0") }, { code: 0 }],
		[listResponse, { code: 1, stderr: "registry unavailable" }],
	]) {
		const { run } = await fixture(t, responses);
		const output = await run();
		assert.equal(output.code, 1);
		assert.match(output.stdout, /violation|incomplete/);
	}
});

test("clean audit succeeds and enumeration failures do not create scratch files", async (t) => {
	const clean = await fixture(t, [listResponse, { code: 0 }]);
	const output = await clean.run();
	assert.equal(output.code, 0, output.stderr);
	assert.match(output.stdout, /No trust-policy violations/);
	const failed = await fixture(t, [{ code: 7, stderr: "list failed" }]);
	const failure = await failed.run(["--json"]);
	assert.notEqual(failure.code, 0);
	assert.match(failure.stdout + failure.stderr, /list failed/);
	await assert.rejects(stat(path.join(failed.workspace, ".trust-audit-temp")), {
		code: "ENOENT",
	});
});

test("does not overwrite an existing scratch directory or a user-selected directory", async (t) => {
	const { workspace, run, readCalls } = await fixture(t, [listResponse, listResponse]);
	const scratch = path.join(workspace, ".trust-audit-temp");
	await mkdir(scratch);
	const sentinel = path.join(scratch, "keep.txt");
	await writeFile(sentinel, "keep");
	assert.notEqual((await run()).code, 0);
	assert.equal(await readFile(sentinel, "utf8"), "keep");
	assert.notEqual((await run(["--tempDir", workspace])).code, 0);
	assert.equal((await readCalls()).length, 2);
	assert.ok(await stat(path.join(workspace, "package.json")));
});

test("malformed install output fails and still cleans up", async (t) => {
	const { workspace, run } = await fixture(t, [
		listResponse,
		{ code: 1, stdout: "ERR_PNPM_TRUST_DOWNGRADE" },
	]);
	assert.notEqual((await run(["--json"])).code, 0);
	await assert.rejects(stat(path.join(workspace, ".trust-audit-temp")), { code: "ENOENT" });
});

test("the built-in runner can invoke the installed pnpm launcher", async () => {
	const result = await runPnpm(["--version"], process.cwd(), false);
	assert.equal(result.code, 0, result.stderr);
	assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});
