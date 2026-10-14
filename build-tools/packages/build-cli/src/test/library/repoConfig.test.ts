/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";

import { getRunPolicyCheckDefault } from "../../repoConfig.js";

describe("getRunPolicyCheckDefault", () => {
	describe("branch matching with picomatch", () => {
		it("returns true for 'main' branch with 'client' release group", () => {
			const result = getRunPolicyCheckDefault("client", "main");
			assert.isTrue(result);
		});

		it("returns false for 'main' branch with non-client release group", () => {
			const result = getRunPolicyCheckDefault("build-tools", "main");
			assert.isFalse(result);
		});

		it("returns true for 'release/*' pattern with 'client' release group", () => {
			const result = getRunPolicyCheckDefault("client", "release/1.0");
			assert.isTrue(result);
		});

		it("returns true for nested release branch pattern", () => {
			const result = getRunPolicyCheckDefault("client", "release/v2.0.0");
			assert.isTrue(result);
		});

		it("returns false for 'release/*' pattern with non-client release group", () => {
			const result = getRunPolicyCheckDefault("build-tools", "release/1.0");
			assert.isFalse(result);
		});

		it("returns false for undefined branch", () => {
			const result = getRunPolicyCheckDefault("client", undefined);
			assert.isFalse(result);
		});

		it("returns false for unmatched branch", () => {
			const result = getRunPolicyCheckDefault("client", "feature/my-feature");
			assert.isFalse(result);
		});

		it("returns false for develop branch", () => {
			const result = getRunPolicyCheckDefault("client", "develop");
			assert.isFalse(result);
		});

		it("returns false for 'releases' branch (no trailing slash)", () => {
			// This tests that the pattern "release/*" doesn't match "releases"
			const result = getRunPolicyCheckDefault("client", "releases");
			assert.isFalse(result);
		});
	});
});
