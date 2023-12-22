/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { singleJsonCursor, cursorToJsonObject } from "../../../domains/json";
import { JsonCompatible } from "../../../util";
import { testSpecializedCursor } from "../../cursorTestSuite";

const testCases: readonly [string, readonly JsonCompatible[]][] = [
	["null", [null]],
	["boolean", [true, false]],
	["integer", [Number.MIN_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER + 1]],
	["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, Number.MIN_VALUE, Number.MAX_VALUE]],
	// These cases are not supported by JSON.stringify, and thus excluded from testing here (they fail some tests).
	// TODO: determine where in the API surface these unsupported values should be detected and how they should be handled,
	// and test that it is working properly.
	// ["non-finite", [NaN, -Infinity, +Infinity]],
	// ["minus zero", [-0]],
	["string", ["", '\\"\b\f\n\r\t', "😀"]],
	["object", [{}, { one: "field" }, { nested: { depth: 1 } }, { emptyArray: [] }]],
	["array", [[], [[]], ["oneItem"], [["nested depth 1"]]]],
	[
		"composite",
		[
			{
				n: null,
				b: true,
				i: 0,
				s: "",
				a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [0] }],
			},
			[null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", {}] }],
		],
	],
	[
		"problematic field names",
		[
			{
				["__proto__"]: 1,
				[""]: 2,
				hasOwnProperty: 3,
				toString: 4,
			},
		],
	],
];

const cursors: { name: string; dataFactory: () => JsonCompatible }[] = [];

for (const [name, testValues] of testCases) {
	for (const data of testValues) {
		cursors.push({
			name: `${name}: ${JSON.stringify(data)}`,
			dataFactory: () => data,
		});
	}
}

testSpecializedCursor({
	cursorName: "JsonCursor",
	cursorFactory: singleJsonCursor,
	dataFromCursor: cursorToJsonObject,
	testData: cursors,
	builders: {
		withKeys: (keys) => {
			const obj = {};
			for (const key of keys) {
				Object.defineProperty(obj, key, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: 5, // Arbitrary child node value
				});
			}
			return obj;
		},
	},
});
