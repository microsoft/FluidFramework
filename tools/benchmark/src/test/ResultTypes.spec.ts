/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isResultError, isSuiteNode, ValueType, type ReportEntry } from "../ResultTypes.js";

const successEntry: ReportEntry = {
	benchmarkName: "passing test",
	data: [
		{
			name: "test",
			value: 42,
			units: "ns/op",
			type: ValueType.SmallerIsBetter,
			significance: "Primary" as const,
		},
	],
};

describe("ResultTypes", () => {
	it("isResultError", () => {
		assert(isResultError({ error: "something went wrong" }));
		assert(!isResultError(successEntry.data));
	});

	it("isSuiteNode", () => {
		assert(isSuiteNode({ suiteName: "S", contents: [] }));
		assert(!isSuiteNode(successEntry));
	});
});
