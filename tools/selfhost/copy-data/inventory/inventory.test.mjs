/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { main, parseArgs } from "./inventory.mjs";

test("accepts and deduplicates a JSON array while preserving the singular option", () => {
	assert.deepEqual(
		parseArgs(["--tenant-ids", '["tenant-a","tenant-b","tenant-a"]']).tenantIds,
		["tenant-a", "tenant-b"],
	);
	assert.equal(parseArgs(["--tenant-id", "tenant-a"]).tenantId, "tenant-a");
});

test("rejects malformed, empty, ambiguous, and missing tenant filters", () => {
	for (const argv of [
		["--tenant-ids"],
		["--tenant-ids", "--output"],
		["--tenant-ids", "tenant-a,tenant-b"],
		["--tenant-ids", "[]"],
		["--tenant-ids", '[""]'],
		["--tenant-ids", "[1]"],
		["--tenant-ids", '{"tenant":"a"}'],
		["--tenant-id", "tenant-a", "--tenant-ids", '["tenant-b"]'],
	]) {
		assert.throws(() => parseArgs(argv), { name: "ConfigurationError" });
	}
});

async function fixture(t) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "selfhost-inventory-test-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const output = path.join(directory, "inventory.json");
	const calls = [];
	const runAz = async (args) => {
		calls.push(args);
		if (args[0] === "account") return { id: "subscription", name: "test" };
		if (args[1] === "server")
			return [
				{ name: "a", resourceGroup: "group-a", frsTenantId: "tenant-a" },
				{ name: "b", resourceGroup: "group-b", frsTenantId: "tenant-b" },
				{ name: "c", resourceGroup: "group-a", frsTenantId: "tenant-c" },
				{ name: "unknown", resourceGroup: "group-b" },
			];
		const name = args[args.indexOf("--server-name") + 1];
		return name === "unknown"
			? [{ frsTenantId: "tenant-b", frsContainerId: "doc-b" }]
			: [{ frsTenantId: `tenant-${name}`, frsContainerId: `doc-${name}` }];
	};
	return { output, calls, runAz };
}

test("collects selected tenants across groups in one owner-only, deduplicated inventory", async (t) => {
	const f = await fixture(t);
	assert.equal(
		await main(["--tenant-ids", '["tenant-a","tenant-b"]', "--output", f.output], f.runAz),
		0,
	);
	const result = JSON.parse(await readFile(f.output, "utf8"));
	assert.deepEqual(Object.keys(result.tenants), ["tenant-a", "tenant-b"]);
	assert.equal(result.documentCount, 2);
	assert.deepEqual(result.tenantFilters, ["tenant-a", "tenant-b"]);
	assert.equal((await stat(f.output)).mode & 0o777, 0o600);
	const containerCalls = f.calls.filter((args) => args[1] === "container");
	assert.equal(containerCalls.length, 3);
	assert.ok(containerCalls.some((args) => args.includes("group-a")));
	assert.ok(containerCalls.some((args) => args.includes("group-b")));
	assert.equal(
		containerCalls.some((args) => args.includes("c")),
		false,
	);
});

test("missing requested tenants fail without overwriting an existing inventory", async (t) => {
	const f = await fixture(t);
	await writeFile(f.output, "keep");
	await assert.rejects(
		main(["--tenant-ids", '["tenant-a","missing"]', "-o", f.output], f.runAz),
		/Requested tenant\(s\) not found.*missing/,
	);
	assert.equal(await readFile(f.output, "utf8"), "keep");
});

test("singular and unfiltered inventory paths remain supported", async (t) => {
	const f = await fixture(t);
	await main(["--tenant-id", "tenant-a", "-o", f.output], f.runAz);
	let result = JSON.parse(await readFile(f.output, "utf8"));
	assert.deepEqual(Object.keys(result.tenants), ["tenant-a"]);
	assert.equal(result.tenantFilter, "tenant-a");
	await main(["-o", f.output], f.runAz);
	result = JSON.parse(await readFile(f.output, "utf8"));
	assert.deepEqual(Object.keys(result.tenants), ["tenant-a", "tenant-b", "tenant-c"]);
	assert.equal(result.documentCount, 3);
});
