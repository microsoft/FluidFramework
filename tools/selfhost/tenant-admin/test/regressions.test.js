/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// Regression tests for defects found in review. Each of these passed the original happy-path
// suite and still lost data or stranded state, so they are pinned here explicitly.

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const { GitrestClient } = require("../src/gitrestClient");
const { RiddlerClient } = require("../src/riddlerClient");
const { TenantManager } = require("../src/tenantManager");
const { startStubServices } = require("./stubServices");

const execFileAsync = promisify(execFile);
const CLI = path.join(__dirname, "..", "bin", "tenant-admin.js");
const WRAPPER = fs.readFileSync(
	path.join(__dirname, "..", "tenant-admin.sh"),
	"utf8",
);

function managerFor(stub) {
	return new TenantManager({
		riddler: new RiddlerClient({ baseUrl: stub.baseUrl }),
		gitrest: new GitrestClient({ baseUrl: stub.baseUrl, owner: "fluid" }),
		gitrestUrl: "http://gitrest",
		historianUrl: "http://historian",
	});
}

// --------------------------------------------------------------------------------------------
// A soft-deleted tenant is hidden by riddler's default reads. If the tool's pre-flight lookups
// do not opt into includeDisabledTenant, the default delete strands the tenant id forever: it
// cannot be purged and cannot be recreated.
// --------------------------------------------------------------------------------------------

test("a soft-deleted tenant can still be purged", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	await manager.deleteTenant("contoso"); // soft
	assert.equal(stub.tenants.get("contoso").disabled, true);

	const purged = await manager.deleteTenant("contoso", { purgeNow: true });
	assert.equal(purged.mode, "hard");
	assert.equal(
		stub.tenants.has("contoso"),
		false,
		"the document must actually be gone, not merely hidden",
	);
});

test("recreating a soft-deleted tenant id explains the real reason", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	await manager.deleteTenant("contoso"); // soft

	await assert.rejects(
		() => manager.createTenant("contoso", { contact: "new@contoso.com" }),
		// The id is still taken by the disabled document; saying only "already exists" while
		// `get` and `list` both report it missing is the confusing outcome to avoid.
		/soft-deleted/i,
	);
});

test("a soft-deleted id becomes reusable after a purge", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	await manager.deleteTenant("contoso");
	await manager.deleteTenant("contoso", { purgeNow: true });

	const recreated = await manager.createTenant("contoso", {
		contact: "new@contoso.com",
	});
	assert.equal(recreated.tenantId, "contoso");
	assert.equal(recreated.repositoryCreated, false, "the repository is reused");
});

// --------------------------------------------------------------------------------------------
// rotate must report which key it rotated, and the wrapper must keep no key copies.
// --------------------------------------------------------------------------------------------

test("rotate reports which key it rotated", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	const created = await manager.createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	const result = await manager.rotateTenantKey("contoso", "key2");

	assert.equal(result.keyName, "key2");
	// Selecting by keyName must yield the NEW value; key1 is deliberately unchanged.
	assert.notEqual(result.keys[result.keyName], created.secondaryKey);
	assert.equal(result.keys.key1, created.key);
});

test("the wrapper never writes tenant keys to Key Vault", () => {
	// Tenants created by this tool are durable in riddler's database -- nothing re-upserts them --
	// so a second copy in Key Vault would only be state to keep in sync. `get-key` re-reads a key
	// on demand instead.
	//
	// The wrapper DOES read one secret, for the `rotate` in-use check (see src/keyVaultGuard.js):
	// it needs to know whether the key being rotated is the one the token service signs with.
	// That is a read of a secret the token-service deploy already created, not a second copy of
	// anything. Writing remains prohibited, so the assertion below ignores the suggested command
	// the wrapper prints for the operator to run themselves.
	const executedLines = WRAPPER.split("\n").filter(
		(line) => !/^\s*(#|echo )/.test(line),
	);
	assert.ok(
		!executedLines.some((line) => /az keyvault secret set/.test(line)),
		"tenant-admin.sh must not write secrets to Key Vault",
	);
	assert.ok(
		!/az keyvault secret (delete|purge|restore)/.test(WRAPPER),
		"tenant-admin.sh must not manage the lifecycle of Key Vault secrets",
	);
});

test("the rotate check reads Key Vault from inside the cluster", () => {
	// The vault is private-endpoint-only. Reading it from the operator's machine would mean
	// flipping public network access on and back off around every rotation, briefly exposing the
	// vault to the internet; the Pod is already in the VNet, so the read belongs there.
	// (Filtered to executed lines: the wrapper still prints an `az keyvault secret set` command
	// for the operator to run themselves after a rotation.)
	const executedLines = WRAPPER.split("\n").filter(
		(line) => !/^\s*(#|echo )/.test(line),
	);
	assert.ok(
		!executedLines.some((line) => /az keyvault/.test(line)),
		"tenant-admin.sh must not call Key Vault directly -- the Pod does the read",
	);
	assert.ok(
		!executedLines.some((line) => /public-network-access/.test(line)),
		"tenant-admin.sh must never change the vault's network posture",
	);
	// Only the vault NAME crosses into the Pod; the secret never leaves the cluster.
	assert.ok(
		/--keyvault-name/.test(WRAPPER),
		"the wrapper should pass the vault name to the CLI",
	);
	assert.ok(
		!/--keyvault-key-sha256|--keyvault-secret-value/.test(WRAPPER),
		"the wrapper should no longer pass secret material or digests to the CLI",
	);
	assert.ok(
		/jqr '\.keyVault\.name'/.test(WRAPPER),
		"the vault name should come from the parameters file",
	);
});

test("the Pod is given the workload identity it needs to reach Key Vault", () => {
	// The AKS workload-identity webhook injects the federated-token env only for a Pod that sets
	// serviceAccountName AND carries this label. Missing either one and the read fails at
	// runtime, which fails the rotation closed -- correct, but needlessly.
	assert.ok(
		/azure\.workload\.identity\/use/.test(WRAPPER),
		"the Pod needs the workload-identity label",
	);
	assert.ok(
		/serviceAccountName/.test(WRAPPER),
		"the Pod needs to run as the workload-identity ServiceAccount",
	);
	assert.ok(
		/fluid-workload-identity/.test(WRAPPER),
		"it should reuse the ServiceAccount azure/deploy.sh already creates",
	);
});

test("--force skips the Key Vault check without needing the workload identity", () => {
	// The error for a missing ServiceAccount tells the operator to pass --force. If --force still
	// set KV_ARGS, it would still demand that ServiceAccount and exit with the same message --
	// advice that cannot be followed. --force must therefore short-circuit before KV_ARGS is set.
	assert.match(
		WRAPPER,
		/FORCE=false/,
		"the wrapper should detect --force before deciding to consult Key Vault",
	);
	const lines = WRAPPER.split("\n");
	const guard = lines.find((line) => /^if \[ "\$COMMAND" = "rotate" \]/.test(line));
	assert.ok(guard, "expected the rotate guard that sets KV_ARGS");
	assert.match(
		guard,
		/FORCE/,
		"setting --keyvault-name must be skipped when --force is given",
	);
});

test("only the Key Vault check opts a Pod into the workload-identity webhook", () => {
	// That webhook is failurePolicy=Fail with objectSelector azure.workload.identity/use=true, so
	// the label makes Pod creation depend on the webhook being reachable. Labelling every Pod
	// meant a webhook outage (its pods stranded on a NotReady node) broke `list`, `get`,
	// `create` and `delete` too -- none of which touch Key Vault. The identity must therefore be
	// requested only when the check will actually run.
	const lines = WRAPPER.split("\n");
	assert.ok(
		lines.some((line) => /^WORKLOAD_SA=""\s*$/.test(line)),
		"WORKLOAD_SA should default to empty, i.e. no workload identity",
	);

	const assignment = lines.findIndex((line) =>
		/^\s*WORKLOAD_SA="fluid-workload-identity"/.test(line),
	);
	assert.ok(assignment !== -1, "expected the ServiceAccount to be assigned somewhere");

	// Walk back to the enclosing `if` and confirm it is gated on the Key Vault check running.
	const guard = lines
		.slice(0, assignment)
		.reverse()
		.find((line) => /^\s*if\s/.test(line));
	assert.match(
		guard,
		/KV_ARGS/,
		"the workload identity should only be requested when the Key Vault check will run",
	);
});

test("the wrapper keeps no plaintext key on disk", () => {
	// With mirroring gone there is no temp file holding key material, so there is no window in
	// which an interrupted run could leave one behind.
	assert.ok(!/mktemp -t tenant-key/.test(WRAPPER));
	assert.ok(!/SECRET_FILE/.test(WRAPPER));
});

test("the wrapper passes the CLI output through unmodified", () => {
	// create/rotate print the key: riddler's database is its only home, and the operator
	// needs the value at that moment to configure a token service.
	assert.ok(
		/printf '%s\\n' "\$OUTPUT"/.test(WRAPPER),
		"the wrapper should emit the CLI's JSON verbatim",
	);
	assert.ok(
		!/del\(\.key/.test(WRAPPER),
		"the wrapper should no longer strip key material from its output",
	);
});

test("tenant keys travel over kubectl exec, never Pod logs", () => {
	assert.match(
		WRAPPER,
		/k exec "\$POD_NAME" -- node \/app\/bin\/tenant-admin\.js/,
		"the CLI result should be streamed directly to the requesting terminal",
	);
	assert.ok(
		!/k logs "\$POD_NAME"/.test(WRAPPER),
		"reading CLI output from Pod logs would expose returned tenant keys to log collectors",
	);
	assert.match(
		WRAPPER,
		/command: \["sh", "-c", "sleep 900"\]/,
		"the Pod's logged primary process must not execute tenant-admin",
	);
});

test("the disposable Pod does not delay command exit during cleanup", () => {
	assert.match(
		WRAPPER,
		/delete pod "\$POD_NAME"[\s\S]*?--grace-period=1 --wait=false/,
		"cleanup should request Pod deletion without waiting for termination",
	);
	assert.match(
		WRAPPER,
		/terminationGracePeriodSeconds: 1/,
		"the idle Pod should not retain Kubernetes' default 30-second termination grace period",
	);
});

// --------------------------------------------------------------------------------------------
// A cosmetic metadata write must never destroy the result of a completed rotation.
// --------------------------------------------------------------------------------------------

test("a failed metadata update still returns the rotated key", async (t) => {
	const stub = await startStubServices({
		fail: ({ method, path: p }) =>
			method === "PUT" && p.endsWith("/customData")
				? { status: 500, body: '{"error":"transient"}' }
				: undefined,
	});
	t.after(() => stub.close());
	const manager = managerFor(stub);

	const created = await manager.createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	// The rotation is already persisted by riddler at this point; throwing here would leave the
	// operator with dead tokens and no way to learn the new key from the command output.
	const result = await manager.rotateTenantKey("contoso", "key2");

	assert.notEqual(result.keys.key2, created.secondaryKey);
	assert.match(result.metadataWarning ?? "", /rotated successfully/i);
});

// --------------------------------------------------------------------------------------------
// Flags that take a value must not silently coerce a bare flag into a number.
// --------------------------------------------------------------------------------------------

test("a valueless --purge-in-days is rejected, not read as 1 day", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	await manager.createTenant("contoso", { contact: "owner@contoso.com" });

	// The wrapper always appends --requestor/--json, so a trailing --purge-in-days is always
	// followed by another flag and parses as boolean true. Number(true) === 1 would pass a naive
	// isFinite check and silently schedule a real deletion.
	await assert.rejects(
		() =>
			execFileAsync(process.execPath, [
				CLI,
				"delete",
				"contoso",
				"--purge-in-days",
				"--requestor",
				"me@example.com",
				"--riddler-url",
				stub.baseUrl,
				"--gitrest-url",
				stub.baseUrl,
				"--json",
			]),
		(error) => {
			assert.match(error.stderr, /--purge-in-days requires a numeric value/);
			return true;
		},
	);
	assert.equal(
		stub.tenants.get("contoso").disabled,
		false,
		"the tenant must not have been deleted",
	);
});

test("a valueless --timeout-ms is rejected, not read as 1ms", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await assert.rejects(
		() =>
			execFileAsync(process.execPath, [
				CLI,
				"list",
				"--timeout-ms",
				"--riddler-url",
				stub.baseUrl,
				"--json",
			]),
		(error) => {
			assert.match(error.stderr, /--timeout-ms requires a numeric value/);
			return true;
		},
	);
});

// --------------------------------------------------------------------------------------------
// The Helm-seeded tenant is re-upserted by riddler on every restart, and on this stack a
// tenant-key-guardian sidecar rewrites its key every 15s. Riddler accepts a rotation or delete
// for it and reports success, then the change is silently undone.
// --------------------------------------------------------------------------------------------

/** A tenant as the Helm bootstrap leaves it: no customData.createdBy. */
function seedBootstrapTenant(stub, id = "fluid") {
	stub.tenants.set(id, {
		_id: id,
		key: "bootstrapkey0000000000000000000",
		storage: { url: "http://gitrest", owner: "fluid", repository: id },
		customData: {}, // riddler backfills an empty object for older tenants
		disabled: false,
	});
	stub.repositories.add(`fluid/${id}`);
}

test("rotate refuses a bootstrap-managed tenant by default", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	seedBootstrapTenant(stub);
	const manager = managerFor(stub);
	const before = stub.tenants.get("fluid").key;

	await assert.rejects(
		() => manager.rotateTenantKey("fluid", "key1"),
		/not created by tenant-admin|silently reverted/i,
	);
	assert.equal(
		stub.tenants.get("fluid").key,
		before,
		"the key must not have been rotated",
	);
});

test("delete refuses a bootstrap-managed tenant by default", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	seedBootstrapTenant(stub);

	await assert.rejects(
		() => managerFor(stub).deleteTenant("fluid"),
		/Refusing to delete/i,
	);
	assert.equal(
		stub.tenants.get("fluid").disabled,
		false,
		"deleting the deployment's own tenant would leave it disabled with no way to re-enable it",
	);
});

test("--force overrides the bootstrap-managed guard", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	seedBootstrapTenant(stub);

	const result = await managerFor(stub).rotateTenantKey("fluid", "key1", {
		force: true,
	});
	assert.equal(result.keyName, "key1");
});

test("reads of a bootstrap-managed tenant are never blocked", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	seedBootstrapTenant(stub);
	const manager = managerFor(stub);

	// get / list / get-key must keep working -- the guard is only for destructive operations.
	assert.equal((await manager.getTenant("fluid")).id, "fluid");
	assert.equal((await manager.listTenants()).length, 1);
	const keys = await manager.getTenantKeys("fluid");
	assert.equal(keys.key1, "bootstrapkey0000000000000000000");
});

test("tenants created by tenant-admin are not caught by the guard", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	await assert.doesNotReject(() => manager.rotateTenantKey("contoso", "key2"));
	await assert.doesNotReject(() => manager.deleteTenant("contoso"));
});

// --------------------------------------------------------------------------------------------
// Riddler stamps customData.encryptionKeyVersion on every tenant it creates. With the upstream
// pass-through SecretManager nothing is actually encrypted, so the field misreports the security
// properties of the record.
// --------------------------------------------------------------------------------------------

test("createTenant clears riddler's misleading encryptionKeyVersion stamp", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const result = await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
		requestor: "admin@contoso.com",
	});

	const stored = stub.tenants.get("contoso").customData;
	assert.equal(
		stored.encryptionKeyVersion,
		undefined,
		"the key is plaintext; claiming a 2022 key-encryption-key version is false",
	);
	assert.equal(result.customData.encryptionKeyVersion, undefined);
	// The metadata that matters must survive the rewrite.
	assert.equal(stored.tenantAdminContact, "owner@contoso.com");
	assert.equal(stored.createdBy, "admin@contoso.com");
	assert.ok(stored.createdAt);
});

test("a failed customData cleanup does not fail the create", async (t) => {
	const stub = await startStubServices({
		fail: ({ method, path: p }) =>
			method === "PUT" && p.endsWith("/customData")
				? { status: 500, body: '{"error":"transient"}' }
				: undefined,
	});
	t.after(() => stub.close());

	// The tenant and its storage already exist by this point; failing here would strand both.
	const result = await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	assert.match(result.key, /^[0-9a-f]+$/);
	assert.match(result.customDataWarning ?? "", /encryptionKeyVersion/);
});

// --------------------------------------------------------------------------------------------
// get-key --key narrows the output to a single key.
// --------------------------------------------------------------------------------------------

test("get-key returns both keys by default and one with --key", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	const created = await manager.createTenant("contoso", {
		contact: "owner@contoso.com",
	});

	assert.deepEqual(await manager.getTenantKeys("contoso"), {
		key1: created.key,
		key2: created.secondaryKey,
	});
	assert.deepEqual(await manager.getTenantKeys("contoso", { keyName: "key1" }), {
		key1: created.key,
	});
	assert.deepEqual(await manager.getTenantKeys("contoso", { keyName: "key2" }), {
		key2: created.secondaryKey,
	});
	await assert.rejects(
		() => manager.getTenantKeys("contoso", { keyName: "key3" }),
		/Invalid key name/,
	);
});
