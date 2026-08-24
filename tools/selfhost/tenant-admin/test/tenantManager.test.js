/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { GitrestClient } = require("../src/gitrestClient");
const { RiddlerClient } = require("../src/riddlerClient");
const { TenantManager } = require("../src/tenantManager");
const { startStubServices } = require("./stubServices");

/**
 * Build a TenantManager wired to the stub server. Both clients share the base URL so the call
 * log preserves a single global ordering.
 */
function managerFor(stub, overrides = {}) {
	return new TenantManager({
		riddler: new RiddlerClient({ baseUrl: stub.baseUrl }),
		gitrest: new GitrestClient({ baseUrl: stub.baseUrl, owner: "fluid" }),
		gitrestUrl: "http://gitrest",
		historianUrl: "http://historian",
		...overrides,
	});
}

test("createTenant provisions storage BEFORE registering the tenant", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
		requestor: "admin@contoso.com",
	});

	const repoCreate = stub.calls.findIndex(
		(c) => c.method === "POST" && c.path === "/fluid/repos",
	);
	const tenantCreate = stub.calls.findIndex(
		(c) => c.method === "POST" && c.path === "/api/tenants/contoso",
	);
	assert.ok(repoCreate !== -1, "gitrest repo creation should happen");
	assert.ok(tenantCreate !== -1, "riddler tenant creation should happen");
	assert.ok(
		repoCreate < tenantCreate,
		"storage must be provisioned before the tenant record exists",
	);
	assert.ok(stub.repositories.has("fluid/contoso"));
});

test("createTenant records ownership metadata and returns riddler's key", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	const result = await managerFor(stub).createTenant("Contoso-Prod", {
		contact: "Owner@Contoso.com",
		requestor: "Admin@Contoso.com",
	});

	assert.equal(result.tenantId, "contoso-prod", "tenant id is normalized");
	assert.match(result.key, /^[0-9a-f]{32}$/);
	assert.match(result.secondaryKey, /^[0-9a-f]{32}$/);
	assert.equal(result.customData.tenantAdminContact, "owner@contoso.com");
	assert.equal(result.customData.createdBy, "admin@contoso.com");
	assert.equal(result.customData.lastModifiedBy, "admin@contoso.com");
	assert.ok(Date.parse(result.customData.createdAt) > 0);
	assert.equal(result.customData.createdAt, result.customData.lastModifiedAt);
});

test("createTenant writes a cluster-resolvable storage config with repository == tenantId", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	// gitrest is reached over the stub's loopback URL, but the URL recorded in the tenant
	// document must be the in-cluster one -- this is the port-forward case.
	const result = await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
	});

	assert.deepEqual(result.storage, {
		url: "http://gitrest",
		historianUrl: "http://historian",
		internalHistorianUrl: "http://historian",
		owner: "fluid",
		repository: "contoso",
	});
	const stored = stub.tenants.get("contoso").storage;
	assert.equal(stored.url, "http://gitrest");
	assert.equal(stored.repository, "contoso");
});

test("createTenant rejects a duplicate id without creating a repository", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	const callsBefore = stub.calls.length;

	await assert.rejects(
		() => manager.createTenant("contoso", { contact: "other@contoso.com" }),
		/already exists/i,
	);
	const newCalls = stub.calls.slice(callsBefore);
	assert.ok(
		!newCalls.some((c) => c.method === "POST" && c.path.endsWith("/repos")),
		"a duplicate id must fail before any storage is provisioned",
	);
});

test("createTenant surfaces the orphaned repository when the tenant record fails", async (t) => {
	const stub = await startStubServices({
		fail: ({ method, path }) =>
			method === "POST" && path === "/api/tenants/contoso"
				? { status: 500, body: '{"error":"riddler exploded"}' }
				: undefined,
	});
	t.after(() => stub.close());

	await assert.rejects(
		() => managerFor(stub).createTenant("contoso", { contact: "o@c.com" }),
		(error) => {
			assert.equal(error.orphanedRepository, "fluid/contoso");
			return true;
		},
	);
	// The repository is intentionally left behind; a retry must reuse it rather than fail.
	assert.ok(stub.repositories.has("fluid/contoso"));
});

test("createTenant reuses an existing repository instead of failing", async (t) => {
	const stub = await startStubServices({
		repositories: new Set(["fluid/contoso"]),
	});
	t.after(() => stub.close());

	const result = await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	assert.equal(result.repositoryCreated, false);
	assert.ok(
		!stub.calls.some((c) => c.method === "POST" && c.path === "/fluid/repos"),
		"an existing repository must not be re-created",
	);
});

test("createTenant marks an unattributed run as unknown", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const previous = process.env.TENANT_ADMIN_REQUESTOR;
	delete process.env.TENANT_ADMIN_REQUESTOR;
	t.after(() => {
		if (previous !== undefined) {
			process.env.TENANT_ADMIN_REQUESTOR = previous;
		}
	});

	const result = await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	assert.equal(result.customData.createdBy, "unknown");
});

test("every outbound request carries a correlation id", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());

	await managerFor(stub).createTenant("contoso", {
		contact: "owner@contoso.com",
	});
	assert.ok(stub.calls.length > 0);
	for (const call of stub.calls) {
		assert.match(
			call.correlationId ?? "",
			/^[0-9a-f-]{36}$/,
			`${call.method} ${call.path} must carry x-correlation-id`,
		);
	}
});

test("getTenant and listTenants read through riddler", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	await manager.createTenant("fabrikam", { contact: "owner@fabrikam.com" });

	const tenant = await manager.getTenant("CONTOSO");
	assert.equal(tenant.id, "contoso");

	const tenants = await manager.listTenants();
	assert.deepEqual(tenants.map((entry) => entry.id).sort(), [
		"contoso",
		"fabrikam",
	]);
});

test("getTenant reports a missing tenant clearly", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	await assert.rejects(
		() => managerFor(stub).getTenant("nope-nope"),
		/not found/i,
	);
});

test("rotate rotates only the named key and preserves creation metadata", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	const created = await manager.createTenant("contoso", {
		contact: "owner@contoso.com",
		requestor: "creator@contoso.com",
	});

	const result = await manager.rotateTenantKey("contoso", "key2", {
		requestor: "rotator@contoso.com",
	});

	assert.equal(result.keys.key1, created.key, "key1 must be untouched");
	assert.notEqual(result.keys.key2, created.secondaryKey, "key2 must change");

	const custom = stub.tenants.get("contoso").customData;
	assert.equal(custom.createdBy, "creator@contoso.com", "createdBy survives");
	assert.equal(custom.tenantAdminContact, "owner@contoso.com");
	assert.equal(custom.lastModifiedBy, "rotator@contoso.com");
});

test("rotate rejects an unknown key name before calling riddler", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	await manager.createTenant("contoso", { contact: "owner@contoso.com" });
	const before = stub.calls.length;

	await assert.rejects(
		() => manager.rotateTenantKey("contoso", "key3"),
		/Invalid key name/,
	);
	assert.equal(stub.calls.length, before, "no request should be issued");
});

test("set-contact updates ownership without dropping other customData", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);

	await manager.createTenant("contoso", {
		contact: "old@contoso.com",
		requestor: "creator@contoso.com",
	});
	await manager.updateContact("contoso", "New@Contoso.com", {
		requestor: "admin@contoso.com",
	});

	const custom = stub.tenants.get("contoso").customData;
	assert.equal(custom.tenantAdminContact, "new@contoso.com");
	assert.equal(custom.createdBy, "creator@contoso.com");
	assert.ok(custom.createdAt, "createdAt must survive the replace-style PUT");
	assert.equal(custom.lastModifiedBy, "admin@contoso.com");
});

test("delete defaults to a soft delete that hides the tenant but keeps the record", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	await manager.createTenant("contoso", { contact: "owner@contoso.com" });

	const result = await manager.deleteTenant("contoso");
	assert.equal(result.mode, "soft");
	assert.ok(stub.tenants.has("contoso"), "record is retained");
	assert.equal(stub.tenants.get("contoso").disabled, true);
	assert.deepEqual(await manager.listTenants(), []);
	assert.equal((await manager.listTenants({ includeDisabled: true })).length, 1);
});

test("delete --purge-now removes the record outright", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	await manager.createTenant("contoso", { contact: "owner@contoso.com" });

	const result = await manager.deleteTenant("contoso", { purgeNow: true });
	assert.equal(result.mode, "hard");
	assert.equal(stub.tenants.has("contoso"), false);
	// The repository is never removed -- gitrest has no delete route.
	assert.equal(result.orphanedRepository, "fluid/contoso");
	assert.ok(stub.repositories.has("fluid/contoso"));
});

test("delete --purge-in-days schedules a future purge and stays soft for now", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	const manager = managerFor(stub);
	await manager.createTenant("contoso", { contact: "owner@contoso.com" });

	const result = await manager.deleteTenant("contoso", { purgeInDays: 7 });
	assert.equal(result.mode, "soft");
	assert.ok(
		Date.parse(result.scheduledDeletionTime) > Date.now(),
		"purge date must be in the future",
	);
	assert.equal(stub.tenants.get("contoso").disabled, true);

	await assert.rejects(
		() => manager.deleteTenant("contoso", { purgeInDays: -1 }),
		/positive number/,
		"a bad flag must be reported as a bad flag, before any network call",
	);
});

test("delete refuses an unknown tenant", async (t) => {
	const stub = await startStubServices();
	t.after(() => stub.close());
	await assert.rejects(
		() => managerFor(stub).deleteTenant("ghost-tenant"),
		/not found/i,
	);
});

test("riddler transport errors never leak key material", async (t) => {
	// Riddler echoing a tenant key back inside an error body must not reach the thrown message.
	const stub = await startStubServices({
		fail: ({ method, path }) =>
			method === "POST" && path === "/api/tenants/contoso"
				? { status: 500, body: '{"key":"deadbeefdeadbeef","error":"boom"}' }
				: undefined,
	});
	t.after(() => stub.close());

	await assert.rejects(
		() => managerFor(stub).createTenant("contoso", { contact: "o@c.com" }),
		(error) => {
			assert.ok(
				!error.message.includes("deadbeefdeadbeef"),
				`key leaked into error message: ${error.message}`,
			);
			assert.ok(error.message.includes("[REDACTED]"));
			return true;
		},
	);
});
