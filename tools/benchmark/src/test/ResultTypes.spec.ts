/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isResultError, ValueType } from "../ResultTypes.js";

describe("ResultTypes", () => {
	it("isResultError", () => {
		assert(isResultError({ error: "something went wrong" }));
		assert(
			!isResultError([
				{
					name: "test",
					value: 42,
					units: "ns/op",
					type: ValueType.SmallerIsBetter,
					significance: "Primary" as const,
				},
				{
					name: "Test Duration",
					value: 1.5,
					units: "seconds",
					type: ValueType.SmallerIsBetter,
					significance: "Diagnostic" as const,
				},
			]),
		);
	});
});
