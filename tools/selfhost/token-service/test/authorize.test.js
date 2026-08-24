/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
	READ_ONLY_SCOPES,
	READ_WRITE_SCOPES,
	authorize,
	roleBasedAuthorize,
	tenantScopedAuthorize,
} = require("../src/authorize");
const { makeConfig } = require("./helpers");

const principal = { id: "user-1", name: "Ada", roles: [], scopes: [] };

test("default policy grants read/write to an authenticated user", () => {
	const decision = authorize({
		principal,
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.scopes, READ_WRITE_SCOPES);
});

test("default policy refuses a tenant this service holds no key for", () => {
	// Signing for an unknown tenant would use the wrong key and produce tokens riddler rejects,
	// so this is refused up front rather than failing opaquely at connect time.
	const decision = authorize({
		principal,
		tenantId: "someone-elses-tenant",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, false);
	assert.deepEqual(decision.scopes, []);
	assert.match(decision.reason, /not served by this token service/);
});

test("default policy honours a multi-tenant allow-list", () => {
	const config = makeConfig({ allowedTenants: ["fluid", "marketing"] });
	assert.equal(authorize({ principal, tenantId: "marketing", documentId: "", config }).allowed, true);
});

test("role-based policy maps FluidCollaborator to read/write", () => {
	const decision = roleBasedAuthorize({
		principal: { ...principal, roles: ["FluidCollaborator"] },
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.scopes, READ_WRITE_SCOPES);
});

test("role-based policy maps FluidReader to read-only", () => {
	const decision = roleBasedAuthorize({
		principal: { ...principal, roles: ["FluidReader"] },
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.scopes, READ_ONLY_SCOPES);
	assert.ok(!decision.scopes.includes("doc:write"));
});

test("role-based policy prefers the more permissive role", () => {
	const decision = roleBasedAuthorize({
		principal: { ...principal, roles: ["FluidReader", "FluidCollaborator"] },
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});
	assert.deepEqual(decision.scopes, READ_WRITE_SCOPES);
});

test("role-based policy denies a user holding no granted role", () => {
	const decision = roleBasedAuthorize({
		principal,
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, false);
	assert.match(decision.reason, /not been granted access/);
});

test("default policy is marked so startup can warn about tenant-blindness", () => {
	assert.equal(authorize.isDefaultPolicy, true);
	// A replacement policy must not inherit the flag, or the warning would be suppressed.
	assert.notEqual(tenantScopedAuthorize.isDefaultPolicy, true);
	assert.notEqual(roleBasedAuthorize.isDefaultPolicy, true);
});

test("default policy grants one user access to every served tenant", () => {
	// Pinning the documented weakness rather than leaving it implicit: this is exactly why
	// tenantScopedAuthorize exists, and why startup warns when several tenants are configured.
	const config = makeConfig({ allowedTenants: ["fluid", "marketing"] });

	for (const tenantId of ["fluid", "marketing"]) {
		assert.equal(authorize({ principal, tenantId, documentId: "d", config }).allowed, true);
	}
});

test("tenant-scoped policy isolates tenants from one another", () => {
	const config = makeConfig({ allowedTenants: ["fluid", "marketing"] });
	const marketingUser = { ...principal, roles: ["Fluid.marketing.Writer"] };

	const own = tenantScopedAuthorize({
		principal: marketingUser,
		tenantId: "marketing",
		documentId: "d",
		config,
	});
	assert.equal(own.allowed, true);
	assert.deepEqual(own.scopes, READ_WRITE_SCOPES);

	const other = tenantScopedAuthorize({
		principal: marketingUser,
		tenantId: "fluid",
		documentId: "d",
		config,
	});
	assert.equal(other.allowed, false);
	assert.deepEqual(other.scopes, []);
});

test("tenant-scoped policy maps a per-tenant reader role to read-only", () => {
	const decision = tenantScopedAuthorize({
		principal: { ...principal, roles: ["Fluid.fluid.Reader"] },
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.scopes, READ_ONLY_SCOPES);
});

test("tenant-scoped policy denies a user with no role for the tenant", () => {
	const decision = tenantScopedAuthorize({
		principal,
		tenantId: "fluid",
		documentId: "doc-1",
		config: makeConfig(),
	});

	assert.equal(decision.allowed, false);
});

test("tenant-scoped denial does not reveal whether the tenant exists", () => {
	// Same wording either way, so the endpoint cannot be used to enumerate served tenants.
	const config = makeConfig({ allowedTenants: ["fluid"] });
	const served = tenantScopedAuthorize({ principal, tenantId: "fluid", documentId: "", config });
	const unserved = tenantScopedAuthorize({
		principal,
		tenantId: "nonexistent",
		documentId: "",
		config,
	});

	assert.equal(served.allowed, false);
	assert.equal(unserved.allowed, false);
	assert.notEqual(served.reason, unserved.reason, "unserved tenants report a distinct reason");
});
