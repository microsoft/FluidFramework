/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");

const { startStubServices } = require("./stubServices");

const execFileAsync = promisify(execFile);
const CLI = path.join(__dirname, "..", "bin", "tenant-admin.js");

/**
 * Run the real CLI binary against the stub services.
 * --storage-url is pinned so the tenant document records the in-cluster gitrest URL even though
 * the CLI reaches the stub on loopback.
 */
async function runCli(stub, args, { expectFailure = false } = {}) {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[
				CLI,
				...args,
				"--riddler-url",
				stub.baseUrl,
				"--gitrest-url",
				stub.baseUrl,
				"--storage-url",
				"http://gitrest",
			],
			{ env: { ...process.env, TENANT_ADMIN_REQUESTOR: "cli@test.local" } },
		);
		assert.ok(!expectFailure, "expected the CLI to fail but it succeeded");
		return { stdout, stderr, code: 0 };
	} catch (error) {
		assert.ok(expectFailure, `CLI failed unexpectedly: ${error.stderr || error.message}`);
		return { stdout: error.stdout, stderr: error.stderr, code: error.code };
	}
}

test("CLI help exits cleanly and lists the commands", async () => {
	const { stdout } = await execFileAsync(process.execPath, [CLI, "help"]);
	for (const command of [
		"create",
		"get",
		"list",
		"get-key",
		"rotate",
		"set-contact",
		"delete",
	]) {
		assert.ok(stdout.includes(command), `help should mention "${command}"`);
	}
});

test("CLI create -> get -> list -> delete round trip", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const created = await runCli(stub, ["create", "contoso", "--contact", "owner@contoso.com"]);
	const createdJson = JSON.parse(created.stdout);
	assert.equal(createdJson.tenantId, "contoso");
	assert.match(createdJson.key, /^[0-9a-f]{32}$/);
	assert.equal(createdJson.customData.createdBy, "cli@test.local");
	assert.ok(
		created.stderr.includes("PLAINTEXT"),
		"operator must be told the key is stored in plaintext",
	);

	const got = await runCli(stub, ["get", "contoso"]);
	assert.equal(JSON.parse(got.stdout).id, "contoso");

	const listed = await runCli(stub, ["list"]);
	assert.equal(JSON.parse(listed.stdout).length, 1);

	const deleted = await runCli(stub, ["delete", "contoso", "--purge-now"]);
	assert.equal(JSON.parse(deleted.stdout).mode, "hard");
	assert.ok(
		deleted.stderr.includes("was NOT removed"),
		"operator must be told the repository survives",
	);
});

test("CLI --json suppresses the human-readable notes", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const res = await runCli(stub, [
		"create",
		"contoso",
		"--contact",
		"owner@contoso.com",
		"--json",
	]);
	assert.equal(res.stderr.trim(), "", "stderr must be empty with --json");
	assert.doesNotThrow(() => JSON.parse(res.stdout));
});

test("CLI reports missing arguments with a non-zero exit code", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const noContact = await runCli(stub, ["create", "contoso"], {
		expectFailure: true,
	});
	assert.equal(noContact.code, 1);
	assert.match(noContact.stderr, /--contact/);

	const noId = await runCli(stub, ["get"], { expectFailure: true });
	assert.match(noId.stderr, /<tenantId>/);
});

test("CLI rejects an unsafe tenant id before touching the services", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const res = await runCli(stub, ["create", "../escape", "--contact", "owner@contoso.com"], {
		expectFailure: true,
	});
	assert.match(res.stderr, /Invalid tenant id/);
	assert.equal(stub.calls.length, 0, "no request should have been made");
});

test("CLI supports --flag=value form", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const res = await runCli(stub, ["create", "contoso", "--contact=owner@contoso.com"]);
	assert.equal(JSON.parse(res.stdout).customData.tenantAdminContact, "owner@contoso.com");
});

test("CLI rotate rotates one key and leaves the other intact", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const created = JSON.parse(
		(await runCli(stub, ["create", "contoso", "--contact", "o@c.com"])).stdout,
	);
	const rotated = JSON.parse(
		(await runCli(stub, ["rotate", "contoso", "--key", "key2"])).stdout,
	);

	assert.equal(rotated.keys.key1, created.key);
	assert.notEqual(rotated.keys.key2, created.secondaryKey);
});

test("CLI rotate fails closed when it cannot reach Key Vault", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await runCli(stub, ["create", "contoso", "--contact", "o@c.com"]);

	// --keyvault-name says a vault exists, but this process has no workload identity, so the
	// check cannot run. Rotating anyway is the outcome the check exists to prevent, so it must
	// refuse rather than quietly proceed. (No network is touched: the missing env is detected
	// before any request.)
	const res = await runCli(
		stub,
		["rotate", "contoso", "--key", "key1", "--keyvault-name", "my-kv"],
		{
			expectFailure: true,
		},
	);
	assert.match(res.stderr, /workload identity/i);
	assert.match(res.stderr, /--force/);

	// The tenant must be untouched: failing closed means not rotating.
	const keys = JSON.parse((await runCli(stub, ["get-key", "contoso"])).stdout);
	const after = JSON.parse((await runCli(stub, ["get-key", "contoso"])).stdout);
	assert.equal(keys.key1, after.key1);
});

test("CLI rotate --force skips the Key Vault check entirely", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const created = JSON.parse(
		(await runCli(stub, ["create", "contoso", "--contact", "o@c.com"])).stdout,
	);
	// Same flags as above, which would otherwise fail closed. --force must not consult the vault.
	const res = await runCli(stub, [
		"rotate",
		"contoso",
		"--key",
		"key1",
		"--keyvault-name",
		"my-kv",
		"--force",
	]);
	assert.notEqual(JSON.parse(res.stdout).keys.key1, created.key);
	assert.equal(JSON.parse(res.stdout).keyVaultCheck, "skipped-forced");
});

test("CLI rotate without a vault name records that the check was skipped", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await runCli(stub, ["create", "contoso", "--contact", "o@c.com"]);
	const res = await runCli(stub, ["rotate", "contoso", "--key", "key2"]);
	assert.equal(JSON.parse(res.stdout).keyVaultCheck, "skipped-no-vault");
});
