/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	getMinVersionForCollabDefaults,
	validateRuntimeOptions,
} from "../containerCompatibility.js";

describe("containerCompatibility", () => {
	describe("createBlobPayloadPending defaults", () => {
		it("is undefined (disabled) for minVersionForCollab below 2.40.0", () => {
			const defaults = getMinVersionForCollabDefaults("2.0.0");
			assert.strictEqual(defaults.createBlobPayloadPending, undefined);
		});

		it("is true (enabled) for minVersionForCollab at 2.40.0", () => {
			const defaults = getMinVersionForCollabDefaults("2.40.0");
			assert.strictEqual(defaults.createBlobPayloadPending, true);
		});

		it("is true (enabled) for minVersionForCollab above 2.40.0", () => {
			const defaults = getMinVersionForCollabDefaults("3.0.0");
			assert.strictEqual(defaults.createBlobPayloadPending, true);
		});
	});

	describe("validateRuntimeOptions for createBlobPayloadPending", () => {
		it("does not throw when explicitly disabled (false), regardless of minVersionForCollab", () => {
			assert.doesNotThrow(() =>
				validateRuntimeOptions("3.0.0", { createBlobPayloadPending: false }),
			);
			assert.doesNotThrow(() =>
				validateRuntimeOptions("2.0.0", { createBlobPayloadPending: false }),
			);
		});

		it("does not throw when explicitly enabled (true) with a sufficiently new minVersionForCollab", () => {
			assert.doesNotThrow(() =>
				validateRuntimeOptions("2.40.0", { createBlobPayloadPending: true }),
			);
		});

		it("throws when explicitly enabled (true) with a minVersionForCollab that does not support it", () => {
			assert.throws(() => validateRuntimeOptions("2.0.0", { createBlobPayloadPending: true }));
		});
	});
});
