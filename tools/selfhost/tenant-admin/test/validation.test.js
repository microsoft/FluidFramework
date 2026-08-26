/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTenantId, normalizeContact, ValidationError } = require("../src/validation");

test("normalizeTenantId lowercases and accepts valid ids", () => {
	assert.equal(normalizeTenantId("Contoso"), "contoso");
	assert.equal(normalizeTenantId("  contoso-prod  "), "contoso-prod");
	assert.equal(normalizeTenantId("a1-b2-c3"), "a1-b2-c3");
	assert.equal(normalizeTenantId("fluid"), "fluid");
});

test("normalizeTenantId rejects ids that would escape the gitrest volume", () => {
	// The tenant id becomes a repository directory name, so separators and dots must not survive.
	for (const bad of ["../etc", "a/b", "a.b", "a\\b", "a b", "a%2fb"]) {
		assert.throws(
			() => normalizeTenantId(bad),
			ValidationError,
			`expected ${bad} to be rejected`,
		);
	}
});

test("normalizeTenantId rejects characters that are not portable across all uses of the id", () => {
	// The id becomes a directory name, a URL path segment, and potentially an Azure resource
	// name. Underscores are valid in some of those and not others, so they are excluded.
	assert.throws(() => normalizeTenantId("acme_prod"), ValidationError);
});

test("normalizeTenantId enforces length, shape and reserved names", () => {
	assert.throws(() => normalizeTenantId(""), ValidationError);
	assert.throws(() => normalizeTenantId("ab"), ValidationError);
	assert.throws(() => normalizeTenantId("a".repeat(65)), ValidationError);
	assert.throws(() => normalizeTenantId("-leading"), ValidationError);
	assert.throws(() => normalizeTenantId("trailing-"), ValidationError);
	assert.throws(() => normalizeTenantId("tenants"), ValidationError);
	assert.throws(() => normalizeTenantId("API"), ValidationError);
	assert.throws(() => normalizeTenantId(undefined), ValidationError);
});

test("normalizeContact lowercases and requires an email shape", () => {
	assert.equal(normalizeContact(" Owner@Contoso.com "), "owner@contoso.com");
	assert.throws(() => normalizeContact("not-an-email"), ValidationError);
	assert.throws(() => normalizeContact(""), ValidationError);
	assert.throws(() => normalizeContact(undefined), ValidationError);
});
