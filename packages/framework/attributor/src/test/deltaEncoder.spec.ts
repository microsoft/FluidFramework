/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { deltaEncoder } from "../encoders.js";

describe("deltaEncoder", () => {
	const cases: { name: string; data: number[]; expected: number[] }[] = [
		{ name: "empty lists", data: [], expected: [] },
		{ name: "lists of size 1", data: [5], expected: [5] },
		{ name: "increasing numbers", data: [7, 19], expected: [7, 12] },
		{ name: "decreasing number", data: [19, 17], expected: [19, -2] },
		{
			name: "longer lists",
			data: Array.from({ length: 10 }, (_, i) => 5 * i),
			expected: [0, ...Array.from({ length: 9 }, () => 5)],
		},
	];

	describe("correctly encodes", () => {
		for (const { name, data, expected } of cases) {
			it(name, () => {
				const actual = deltaEncoder.encode(data);
				assert.deepEqual(actual, expected);
			});
		}
	});

	describe("correctly round-trips", () => {
		for (const { name, data } of cases) {
			it(name, () => {
				const actual = deltaEncoder.decode(deltaEncoder.encode(data));
				assert.deepEqual(actual, data);
			});
		}
	});
});
