/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKey } from "../../../core/index.js";
import { NodeChangeset } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { generateRandomChange } from "./randomChangeGenerator.js";
import { MarkMaker as Mark } from "./testEdits.js";

const testSeed = 432167897;
const maxIndex = 3;
const fooField: FieldKey = brand("foo");
const childGen = (seed: number): NodeChangeset => ({
	fieldChanges: new Map([
		[
			fooField,
			{
				fieldKind: brand("field"),
				change: brand({ type: "Insert", content: seed }),
			},
		],
	]),
});

export function testGenerateRandomChange() {
	describe("generateRandomChange", () => {
		it("generates the same change given the same seed", () => {
			const change1 = generateRandomChange(testSeed, maxIndex, childGen);
			const change2 = generateRandomChange(testSeed, maxIndex, childGen);
			assert.deepStrictEqual(change1, change2);
		});

		it("generates different changes given the different seeds", () => {
			const change1 = generateRandomChange(testSeed, maxIndex, childGen);
			const change2 = generateRandomChange(testSeed + 1, maxIndex, childGen);
			assert.notDeepStrictEqual(change1, change2);
		});

		it("Generates a change", () => {
			const change = generateRandomChange(testSeed, maxIndex, childGen);
			const expected = [{ count: 2 }, Mark.remove(5, brand(0))];
			assert.deepStrictEqual(change, expected);
		});
	});
}
