/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { fluidHandleSymbol } from "@fluidframework/core-interfaces";

import { isFluidHandle } from "../handles.js";

describe("Handles", () => {
	it("encodeCompactIdToString() with strings", () => {
		it("isFluidHandle", () => {
			assert(!isFluidHandle(0));
			assert(!isFluidHandle({}));
			assert(!isFluidHandle(undefined));
			// eslint-disable-next-line unicorn/no-null -- We want to explicitly test for null
			assert(!isFluidHandle(null));
			assert(!isFluidHandle([]));
			assert(!isFluidHandle({ get: () => {} }));
			assert(!isFluidHandle({ IFluidHandle: 5, get: () => {} }));

			// Legacy compatibility for non symbol based handle
			const loopy = { IFluidHandle: {} };
			loopy.IFluidHandle = loopy;
			assert(isFluidHandle(loopy));
			assert(!isFluidHandle({ IFluidHandle: 5 }));
			assert(!isFluidHandle({ IFluidHandle: {} }));
			// eslint-disable-next-line unicorn/no-null
			assert(!isFluidHandle({ IFluidHandle: null }));

			// Symbol based:
			assert(isFluidHandle({ [fluidHandleSymbol]: {} }));
		});
	});
});
