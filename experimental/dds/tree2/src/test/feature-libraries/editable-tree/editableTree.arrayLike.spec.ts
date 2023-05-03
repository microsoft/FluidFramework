/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKinds, TypedSchema } from "../../../feature-libraries";

import { arraySchema, buildTestTree } from "./mockData";

export const rootField = TypedSchema.field(FieldKinds.value, arraySchema);

type arrayType = (string | number | arrayType)[];

describe("editable-tree: array-like", () => {
	function createProxy(array: arrayType) {
		const tree = buildTestTree(array, rootField);
		const root = tree.root[0] as unknown as arrayType;
		return root;
	}

	describe("slice()", () => {
		const check = (array: arrayType, start?: number, end?: number) => {
			const expected = array.slice(start, end);
			it(`slice(${JSON.stringify(array)}${start !== undefined ? `, ${start}` : ""}${
				end !== undefined ? `, ${end}` : ""
			}) -> ${JSON.stringify(expected)}`, () => {
				const proxy = createProxy(array);
				const actual = proxy.slice(start, end);
				assert.deepEqual(actual, expected);
			});
		};

		check([]);
		check([0]);
		check([0, 1]);
		check([0, 1], -Infinity);
		check([0, 1], 0, Infinity);
		for (let i = 0; i < 4; i++) {
			check([0, 1], i);
			check([0, 1], -i);
			check([0, 1], 0, i);
			check([0, 1], 0, -i);
		}
	});
});
