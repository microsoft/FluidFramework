/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { PlaceholderTree, placeholderTreeFromCursor, TextCursor } from "../feature-libraries/treeTextFormat";

import { brand } from "../util";

const testCases: [string, PlaceholderTree][] = [
	["minimal", { type: brand("Foo") }],
	["value", { type: brand("Foo"), value: "test" }],
	["nested", { type: brand("Foo"), fields: { x: [{ type: brand("Bar") }, { type: brand("Foo"), value: 6 }] } }],
];

describe("textTreeFormat", () => {
	describe("round trip", () => {
		for (const [name, data] of testCases) {
			it(name, () => {
				const cursor = new TextCursor(data);
				const clone = placeholderTreeFromCursor(cursor);
				assert.deepEqual(clone, data);
				// Check objects are actually json compatible
				const text = JSON.stringify(clone);
				const parsed = JSON.parse(text);
				assert.deepEqual(parsed, data);
			});
		}
	});
});
