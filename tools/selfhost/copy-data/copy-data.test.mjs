import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { main } from "./data-transfer.mjs";

test("uses the default configuration to run phases in order", async () => {
	const calls = [];
	await main(["--execute"], async (scriptPath, args) => {
		calls.push({ script: path.basename(scriptPath), args });
	});

	const configPath = path.resolve(import.meta.dirname, "configuration/parameters/data-transfer.config.json");
	assert.deepEqual(calls, [
		{ script: "validate-config.mjs", args: ["--config", configPath] },
		{ script: "tenant-creation.mjs", args: ["--config", configPath, "--execute"] },
		{ script: "transfer.mjs", args: ["--config", configPath, "--execute"] },
	]);
});

test("uses --config to override the default configuration", async () => {
	const calls = [];
	await main(["--config", "custom-config.json", "--execute"], async (scriptPath, args) => {
		calls.push({ script: path.basename(scriptPath), args });
	});

	const configPath = path.resolve("custom-config.json");
	assert.deepEqual(calls[0], { script: "validate-config.mjs", args: ["--config", configPath] });
});

test("requires execution confirmation", async () => {
	await assert.rejects(
		main([]),
		/Pass --execute/,
	);
});
