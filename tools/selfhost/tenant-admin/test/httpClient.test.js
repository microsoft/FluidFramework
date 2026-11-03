/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { redactSecrets } = require("../src/httpClient");

test("redactSecrets masks key material in objects", () => {
	const redacted = redactSecrets({
		id: "contoso",
		key: "aaaa",
		secondaryKey: "bbbb",
		customData: { tenantAdminContact: "owner@contoso.com" },
	});
	assert.equal(redacted.key, "[REDACTED]");
	assert.equal(redacted.secondaryKey, "[REDACTED]");
	assert.equal(redacted.id, "contoso");
	assert.equal(redacted.customData.tenantAdminContact, "owner@contoso.com");
});

test("redactSecrets masks key material inside JSON strings", () => {
	const out = redactSecrets('{"key1":"deadbeef","key2":"cafebabe","id":"x"}');
	assert.ok(!out.includes("deadbeef"), "key1 value must not survive");
	assert.ok(!out.includes("cafebabe"), "key2 value must not survive");
	assert.ok(out.includes('"id":"x"'));
});

test("redactSecrets recurses through nested structures and arrays", () => {
	const out = redactSecrets({ tenants: [{ key: "s3cret" }, { key: "other" }] });
	assert.equal(out.tenants[0].key, "[REDACTED]");
	assert.equal(out.tenants[1].key, "[REDACTED]");
});

test("redactSecrets leaves non-JSON strings and primitives alone", () => {
	assert.equal(redactSecrets("ECONNREFUSED 10.0.0.1:80"), "ECONNREFUSED 10.0.0.1:80");
	assert.equal(redactSecrets(undefined), undefined);
	assert.equal(redactSecrets(null), null);
	assert.equal(redactSecrets(7), 7);
});
