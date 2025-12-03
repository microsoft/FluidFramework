/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Direction, getDeltaX, getDeltaY } from "../util/index.js";

const cases = [
	{ name: "none", direction: Direction.none, expectedX: 0, expectedY: 0 },
	{ name: "left", direction: Direction.left, expectedX: -1, expectedY: 0 },
	{ name: "right", direction: Direction.right, expectedX: 1, expectedY: 0 },
	{ name: "up", direction: Direction.up, expectedX: 0, expectedY: -1 },
	{ name: "down", direction: Direction.down, expectedX: 0, expectedY: 1 },
	{ name: "up left", direction: Direction.left | Direction.up, expectedX: -1, expectedY: -1 },
	{ name: "up right", direction: Direction.right | Direction.up, expectedX: 1, expectedY: -1 },
	{
		name: "left down",
		direction: Direction.left | Direction.down,
		expectedX: -1,
		expectedY: 1,
	},
	{
		name: "right down",
		direction: Direction.right | Direction.down,
		expectedX: 1,
		expectedY: 1,
	},
];

describe("direction", () => {
	describe("getDeltaX", () => {
		for (const { name, direction, expectedX } of cases) {
			it(`dx(${name}) -> ${expectedX}`, () => {
				assert.strictEqual(getDeltaX(direction), expectedX);
			});
		}
	});
	describe("getDeltaY", () => {
		for (const { name, direction, expectedY } of cases) {
			it(`dy(${name}) -> ${expectedY}`, () => {
				assert.strictEqual(getDeltaY(direction), expectedY);
			});
		}
	});
});
