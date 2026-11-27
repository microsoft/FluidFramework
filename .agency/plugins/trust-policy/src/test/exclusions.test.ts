/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrustPolicyExclude, parseTrustPolicyExcludeConfig } from "../exclusions.js";

test("matches pnpm trustPolicyExclude selectors", () => {
	const excludedBy = createTrustPolicyExclude([
		"semver@5.7.2",
		"semver@6.3.1 || 7.0.0",
		"@scope/exact@1.0.0",
		"@org/*",
		"bare",
		"ch?ck",
		"dot.name",
	]);
	assert.equal(excludedBy("semver", "5.7.2"), "semver@5.7.2");
	assert.equal(excludedBy("semver", "7.0.0"), "semver@6.3.1 || 7.0.0");
	assert.equal(excludedBy("semver", "7.0.1"), undefined);
	assert.equal(excludedBy("@scope/exact", "1.0.0"), "@scope/exact@1.0.0");
	assert.equal(excludedBy("@scope/exact", "1.0.1"), undefined);
	assert.equal(excludedBy("@org/anything", "9.9.9"), "@org/*");
	assert.equal(excludedBy("@org", "1.0.0"), undefined);
	assert.equal(excludedBy("bare", "0.0.1"), "bare");
	assert.equal(excludedBy("bare-suffix", "0.0.1"), undefined);
	assert.equal(excludedBy("check", "1.0.0"), "ch?ck");
	assert.equal(excludedBy("dot.name", "1.0.0"), "dot.name");
	assert.equal(excludedBy("dotxname", "1.0.0"), undefined);
	assert.equal(createTrustPolicyExclude(["!keep"])("other", "1.0.0"), "!keep");
	assert.equal(createTrustPolicyExclude(["!keep"])("keep", "1.0.0"), undefined);
});

test("rejects selectors pnpm rejects, with pnpm's messages", () => {
	for (const [selector, message] of [
		["semver@^5.0.0", /Invalid versions union/],
		["semver@latest", /Invalid versions union/],
		["semver@1.0.0 || ^2", /Invalid versions union/],
		["@org/*@1.0.0", /Name patterns are not allowed/],
	] as const) {
		assert.throws(
			() => createTrustPolicyExclude([selector]),
			(error: Error) =>
				error.message.startsWith("Invalid value in trustPolicyExclude: ") &&
				message.test(error.message),
		);
	}
});

test("normalizes pnpm config get output", () => {
	assert.deepEqual(parseTrustPolicyExcludeConfig(""), []);
	assert.deepEqual(parseTrustPolicyExcludeConfig("undefined\n"), []);
	assert.deepEqual(parseTrustPolicyExcludeConfig('"semver@5.7.2"\n'), ["semver@5.7.2"]);
	assert.deepEqual(parseTrustPolicyExcludeConfig('[\n  "a",\n  "b@1.0.0"\n]\n'), [
		"a",
		"b@1.0.0",
	]);
	assert.throws(() => parseTrustPolicyExcludeConfig("[1]"), /Unexpected/);
});
