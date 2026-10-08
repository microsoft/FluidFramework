/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import { extractJsonValidator } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	FluidHandleSchema,
	FluidSerializableReadOnlySchema,
	TreeValueSchema,
} from "../../util/index.js";

describe("Fluid serializable schemas", () => {
	const validator = extractJsonValidator(FormatValidatorBasic);

	it("validates Fluid handles", () => {
		const check = validator.compile(FluidHandleSchema).check;
		assert(check(new MockHandle("value")));
		assert(!check({ IFluidHandle: { IFluidHandle: true } }));
		assert(!check({}));
	});

	it("validates Tree values", () => {
		const check = validator.compile(TreeValueSchema).check;
		assert(check(new MockHandle("value")));
		assert(check(null));
		assert(check(false));
		assert(check(0));
		assert(check(""));
		assert(!check(undefined));
		assert(!check({}));
	});

	it("validates recursively Fluid-serializable data", () => {
		const check = validator.compile(FluidSerializableReadOnlySchema).check;
		assert(check({ nested: [new MockHandle("value"), { value: 1 }] }));
		assert(!check(undefined));
		assert(!check({ nested: Symbol("unsupported") }));
		assert(check({ nested: { IFluidHandle: { IFluidHandle: true } } }));
	});
});
