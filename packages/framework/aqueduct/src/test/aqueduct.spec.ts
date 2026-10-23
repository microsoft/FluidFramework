/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BaseContainerRuntimeFactory } from "../index.js";

describe("BaseContainerRuntimeFactory", () => {
	const props = {
		registryEntries: [],
		provideEntryPoint: async () => ({}),
	} as const;

	it("accepts oldestSupportedClient", () => {
		assert.doesNotThrow(
			() => new BaseContainerRuntimeFactory({ ...props, oldestSupportedClient: "2.0.0" }),
		);
	});

	it("rejects the removed beta property", () => {
		assert.throws(
			() =>
				new BaseContainerRuntimeFactory({
					...props,
					// @ts-expect-error The removed beta property is rejected at compile time and runtime.
					minVersionForCollab: "2.0.0",
				}),
			/minVersionForCollab is no longer supported/,
		);
	});
});
