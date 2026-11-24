/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import { main } from "./copy-data.mjs";
import { fixture } from "./document-copy/fixtures.mjs";
import { prepareRun } from "./configuration/resume.mjs";

test("uses the default configuration to run phases in order", async () => {
	const calls = [];
	await main(["--execute"], async (scriptPath, args) => {
		calls.push({ script: path.basename(scriptPath), args });
	});

	const configPath = path.resolve(
		import.meta.dirname,
		"configuration/parameters/copy-data.config.json",
	);
	assert.deepEqual(calls, [
		{ script: "validate-config.mjs", args: ["--config", configPath] },
		{ script: "check-deployment.mjs", args: ["--config", configPath] },
		{ script: "tenant-creation.mjs", args: ["--config", configPath, "--execute"] },
		{ script: "copy.mjs", args: ["--config", configPath, "--execute"] },
	]);
});

test("uses --config to override the default configuration", async () => {
	const calls = [];
	await main(["--config", "custom-config.json", "--execute"], async (scriptPath, args) => {
		calls.push({ script: path.basename(scriptPath), args });
	});

	const configPath = path.resolve("custom-config.json");
	assert.deepEqual(calls[0], {
		script: "validate-config.mjs",
		args: ["--config", configPath],
	});
});

test("requires execution confirmation", async () => {
	await assert.rejects(main([]), /Use --execute/);
});

test("failed migration preflight prevents tenant creation and document copy", async () => {
	const calls = [];
	await assert.rejects(
		main(["--execute"], async (script) => {
			calls.push(path.basename(script));
			if (script.endsWith("check-deployment.mjs")) throw new Error("preflight failed");
		}),
		/preflight failed/,
	);
	assert.deepEqual(calls, ["validate-config.mjs", "check-deployment.mjs"]);
});

test("reports the execution confirmation error safely", async () => {
	await assert.rejects(main([]), (error) => error.name === "ConfigurationError");
});

test("validates resume before mutations and forwards only copy options to document copying", async () => {
	const calls = [];
	await main(
		["--execute", "--concurrency", "2", "--failed-only", "reviewed.json", "--ignore-logtail"],
		async (script, args) => {
			calls.push({ script: path.basename(script), args });
		},
	);
	assert.ok(calls[0].args.includes(path.resolve("reviewed.json")));
	assert.equal(calls[2].args.includes("--concurrency"), false);
	for (const call of calls.slice(0, 3))
		assert.equal(call.args.includes("--ignore-logtail"), false);
	assert.deepEqual(calls[3].args.slice(-5), [
		"--concurrency",
		"2",
		"--failed-only",
		"reviewed.json",
		"--ignore-logtail",
	]);
});

test("the real orchestrator reports the failed validation stage before any Azure access", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "selfhost-orchestrator-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const f = fixture({ documents: 1 });
	const config = {
		...f.config,
		inventoryPath: "inventory.json",
		resultsDirectory: "results",
		selfHost: {
			...f.config.selfHost,
			historianEndpoint: "https://historian.example",
			contact: "test-fixture",
		},
	};
	const { results } = await prepareRun(config, f.inventory);
	results.mapping["source-1"].destination.tenantId = "changed";
	await Promise.all([
		writeFile(path.join(root, "config.json"), JSON.stringify(config)),
		writeFile(path.join(root, "inventory.json"), JSON.stringify(f.inventory)),
		writeFile(
			path.join(root, "reviewed.json"),
			JSON.stringify({ stages: { "document-copy": results } }),
		),
	]);
	const child = spawnSync(
		process.execPath,
		[
			path.join(import.meta.dirname, "copy-data.mjs"),
			"--execute",
			"--config",
			path.join(root, "config.json"),
			"--failed-only",
			path.join(root, "reviewed.json"),
		],
		{ encoding: "utf8", timeout: 10_000 },
	);
	assert.equal(child.status, 1, child.stderr);
	assert.match(child.stderr, /mapping differs/);
	assert.match(child.stderr, /Data copy failed: validate-config.mjs failed with exit code 1/);
	assert.doesNotMatch(child.stderr, /An unexpected error/);
});
