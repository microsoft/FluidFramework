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
			!isResultError({
				elapsedSeconds: 1.5,
				data: {
					primary: {
						name: "test",
						value: 42,
						units: "ns/op",
						type: ValueType.SmallerIsBetter,
					},
					additional: [],
				},
			}),
		);
	});
});
