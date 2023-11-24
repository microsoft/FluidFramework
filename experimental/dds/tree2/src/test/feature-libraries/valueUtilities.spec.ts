/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockHandle } from "@fluidframework/test-runtime-utils";
import { ValueSchema } from "../../core";

import {
	allowsValue,
	isFluidHandle,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/valueUtilities";

describe("valueUtilities", () => {
	it("isFluidHandle", () => {
		assert(!isFluidHandle(0));
		assert(!isFluidHandle({}));
		assert(!isFluidHandle(undefined));
		assert(!isFluidHandle(null));
		assert(!isFluidHandle([]));
		assert(!isFluidHandle({ get: () => {} }));
		assert(!isFluidHandle({ IFluidHandle: 5, get: () => {} }));
		assert(isFluidHandle(new MockHandle(5)));
		assert(!isFluidHandle({ IFluidHandle: 5 }));
		assert(!isFluidHandle({ IFluidHandle: {} }));
		const loopy = { IFluidHandle: {} };
		loopy.IFluidHandle = loopy;
		// isFluidHandle has extra logic to check the handle is valid if it passed the detection via cyclic ref.
		assert(!isFluidHandle(loopy));
	});

	it("allowsValue", () => {
		assert(!allowsValue(ValueSchema.FluidHandle, undefined));
		assert(!allowsValue(ValueSchema.Boolean, undefined));
		assert(allowsValue(undefined, undefined));
		assert(!allowsValue(ValueSchema.String, undefined));
		assert(!allowsValue(ValueSchema.Number, undefined));
		assert(!allowsValue(ValueSchema.Null, undefined));

		assert(!allowsValue(ValueSchema.FluidHandle, false));
		assert(allowsValue(ValueSchema.Boolean, false));
		assert(!allowsValue(undefined, false));
		assert(!allowsValue(ValueSchema.String, false));
		assert(!allowsValue(ValueSchema.Number, false));
		assert(!allowsValue(ValueSchema.Null, false));

		assert(!allowsValue(ValueSchema.FluidHandle, 5));
		assert(!allowsValue(ValueSchema.Boolean, 5));
		assert(!allowsValue(undefined, 5));
		assert(!allowsValue(ValueSchema.String, 5));
		assert(allowsValue(ValueSchema.Number, 5));
		assert(!allowsValue(ValueSchema.Null, 5));

		assert(!allowsValue(ValueSchema.FluidHandle, ""));
		assert(!allowsValue(ValueSchema.Boolean, ""));
		assert(!allowsValue(undefined, ""));
		assert(allowsValue(ValueSchema.String, ""));
		assert(!allowsValue(ValueSchema.Number, ""));
		assert(!allowsValue(ValueSchema.Null, ""));

		const handle = new MockHandle(5);
		assert(allowsValue(ValueSchema.FluidHandle, handle));
		assert(!allowsValue(ValueSchema.Boolean, handle));
		assert(!allowsValue(undefined, handle));
		assert(!allowsValue(ValueSchema.String, handle));
		assert(!allowsValue(ValueSchema.Number, handle));
		assert(!allowsValue(ValueSchema.Null, handle));

		assert(!allowsValue(ValueSchema.FluidHandle, null));
		assert(!allowsValue(ValueSchema.Boolean, null));
		assert(!allowsValue(undefined, null));
		assert(!allowsValue(ValueSchema.String, null));
		assert(!allowsValue(ValueSchema.Number, null));
		assert(allowsValue(ValueSchema.Null, null));
	});
});
