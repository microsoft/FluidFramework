/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The `rotate` in-use safety check.
//
// The failure this prevents is silent and expensive: riddler invalidates a rotated key
// immediately, so rotating the key the token-minting Function App is configured with breaks
// every token it mints until someone writes the new value into Key Vault. Nothing in the
// rotation itself reports a problem -- it succeeds -- which is why the check is enforced in code
// rather than left to a runbook.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { GitrestClient } = require("../src/gitrestClient");
const { RiddlerClient } = require("../src/riddlerClient");
const { TenantManager } = require("../src/tenantManager");
const {
	assertKeyNotInUse,
	otherKeyName,
	secretNameForTenant,
} = require("../src/keyVaultGuard");
const { startStubServices } = require("./stubServices");

function managerFor(stub) {
	return new TenantManager({
		riddler: new RiddlerClient({ baseUrl: stub.baseUrl }),
		gitrest: new GitrestClient({ baseUrl: stub.baseUrl, owner: "fluid" }),
		gitrestUrl: "http://gitrest",
		historianUrl: "http://historian",
	});
}

async function createdTenant(stub, tenantId = "contoso") {
	return managerFor(stub).createTenant(tenantId, {
		contact: "owner@contoso.com",
		requestor: "admin@contoso.com",
	});
}

// --------------------------------------------------------------------------------------------
// The pure guard
// --------------------------------------------------------------------------------------------

test("the secret name matches the token service's naming scheme", () => {
	// Must stay in lockstep with kv_secret_name() in token-service/deploy-token-service.sh --
	// if these drift, the guard inspects a secret nothing reads and protects nothing.
	assert.equal(secretNameForTenant("contoso"), "fluid-tenant-key-contoso");
	assert.equal(secretNameForTenant("fluid"), "fluid-tenant-key-fluid");
});

test("otherKeyName names the key that is safe to rotate first", () => {
	assert.equal(otherKeyName("key1"), "key2");
	assert.equal(otherKeyName("key2"), "key1");
});

test("the guard refuses when the key matches the Key Vault secret", () => {
	const key = "0123456789abcdef0123456789abcdef";
	assert.throws(
		() =>
			assertKeyNotInUse({
				tenantId: "contoso",
				keyName: "key1",
				currentKey: key,
				keyVaultBinding: {
					vaultName: "my-kv",
					secretName: "fluid-tenant-key-contoso",
					secretValue: key,
				},
			}),
		(error) => {
			// The operator has to be able to act on this without reading the source, so the
			// message must name the secret, the vault, the consequence and the way out.
			assert.match(error.message, /fluid-tenant-key-contoso/);
			assert.match(error.message, /my-kv/);
			assert.match(error.message, /token-minting Function App/);
			assert.match(error.message, /BREAKS token minting/);
			assert.match(error.message, /--key key2/, "should name the other key");
			assert.match(error.message, /--force/);
			return true;
		},
	);
});

test("the guard allows rotating the key that is NOT in Key Vault", () => {
	// The whole point of two keys: key2 is free to rotate while key1 is in service.
	assert.doesNotThrow(() =>
		assertKeyNotInUse({
			tenantId: "contoso",
			keyName: "key2",
			currentKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			keyVaultBinding: {
				vaultName: "my-kv",
				secretName: "fluid-tenant-key-contoso",
				secretValue: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			},
		}),
	);
});

test("the guard is inert without a binding, and when forced", () => {
	const key = "0123456789abcdef0123456789abcdef";
	const binding = {
		vaultName: "my-kv",
		secretName: "fluid-tenant-key-contoso",
		secretValue: key,
	};
	// No Key Vault configured, or no secret for this tenant: nothing is using the key.
	assert.doesNotThrow(() =>
		assertKeyNotInUse({ tenantId: "contoso", keyName: "key1", currentKey: key }),
	);
	assert.doesNotThrow(() =>
		assertKeyNotInUse({
			tenantId: "contoso",
			keyName: "key1",
			currentKey: key,
			keyVaultBinding: binding,
			force: true,
		}),
	);
});

test("the guard does not treat two empty values as a match", () => {
	// Comparison is on the values themselves, so a vault that somehow returned an empty secret
	// alongside a key riddler failed to report must not read as "these are the same key" and
	// block a legitimate rotation. Both sides are required to be non-empty first.
	assert.doesNotThrow(() =>
		assertKeyNotInUse({
			tenantId: "contoso",
			keyName: "key1",
			currentKey: "",
			keyVaultBinding: {
				vaultName: "my-kv",
				secretName: "fluid-tenant-key-contoso",
				secretValue: "",
			},
		}),
	);
});

test("the guard requires an exact match, not a prefix", () => {
	assert.doesNotThrow(() =>
		assertKeyNotInUse({
			tenantId: "contoso",
			keyName: "key1",
			currentKey: "0123456789abcdef0123456789abcdef",
			keyVaultBinding: {
				vaultName: "my-kv",
				secretName: "fluid-tenant-key-contoso",
				secretValue: "0123456789abcdef",
			},
		}),
	);
});

// --------------------------------------------------------------------------------------------
// Wired into rotateTenantKey
// --------------------------------------------------------------------------------------------

test("rotate refuses the in-use key and leaves both keys untouched", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const created = await createdTenant(stub);
	const before = await managerFor(stub).getTenantKeys("contoso");

	await assert.rejects(
		() =>
			managerFor(stub).rotateTenantKey("contoso", "key1", {
				keyVaultBinding: {
					vaultName: "my-kv",
					secretName: secretNameForTenant("contoso"),
					secretValue: before.key1,
				},
			}),
		/Refusing to rotate key1/,
	);

	// The refusal has to happen BEFORE riddler is asked to rotate: this check is worthless if
	// the destructive call already went out.
	const after = await managerFor(stub).getTenantKeys("contoso");
	assert.equal(after.key1, before.key1, "key1 must not have been rotated");
	assert.equal(after.key2, before.key2, "key2 must not have been touched");
	assert.equal(before.key1, created.key);
});

test("rotate proceeds for the key that is not in Key Vault", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await createdTenant(stub);
	const before = await managerFor(stub).getTenantKeys("contoso");

	// key1 is the one in the vault, so rotating key2 is the safe first step.
	const result = await managerFor(stub).rotateTenantKey("contoso", "key2", {
		keyVaultBinding: {
			vaultName: "my-kv",
			secretName: secretNameForTenant("contoso"),
			secretValue: before.key1,
		},
	});

	assert.equal(result.keyName, "key2");
	assert.equal(result.keys.key1, before.key1, "the in-use key stays valid");
	assert.notEqual(result.keys.key2, before.key2);
});

test("rotate --force overrides the in-use check", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await createdTenant(stub);
	const before = await managerFor(stub).getTenantKeys("contoso");

	const result = await managerFor(stub).rotateTenantKey("contoso", "key1", {
		force: true,
		keyVaultBinding: {
			vaultName: "my-kv",
			secretName: secretNameForTenant("contoso"),
			secretValue: before.key1,
		},
	});

	assert.notEqual(result.keys.key1, before.key1, "force should rotate anyway");
});

test("rotate without a binding does not query riddler for keys", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await createdTenant(stub);
	const startedAt = stub.calls.length;
	await managerFor(stub).rotateTenantKey("contoso", "key2");

	// The extra read exists only to feed the guard; the unguarded path should not pay for it.
	const reads = stub.calls
		.slice(startedAt)
		.filter((c) => c.method === "GET" && c.path === "/api/tenants/contoso/keys");
	assert.equal(reads.length, 0);
});
