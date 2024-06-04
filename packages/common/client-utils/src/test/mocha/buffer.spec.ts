/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "../../indexNode.js";

describe("IsoBuffer", () => {
	it("is a Buffer", () => {
		// Paranoid test that 'IsoBuffer' can be constructed in both CJS/ESM in Node.js environments.
		// Note that no export remapping is involved, given that 'IsoBuffer' is imported from 'indexNode.js'.
		//
		// More comprehensive testing for 'IsoBuffer' is done in 'jest/buffer.spec.ts', which compares
		// Node.js and Broswer implementations for equivalence.
		assert(
			IsoBuffer.from("", "utf8") instanceof Buffer,
			"Expected IsoBuffer.from to return a native Node.js Buffer instance.",
		);
	});
});
