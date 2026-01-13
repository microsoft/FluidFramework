/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { requireTrue, areSafelyAssignable } from "../../util/index.js";
import { allowUnused, type NodeFromSchema } from "../../simple-tree/index.js";

// Allow importing file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { TextAsTree } from "../../text/textDomain.js";

describe("textDomain", () => {
	it("validate node type", () => {
		allowUnused<
			requireTrue<areSafelyAssignable<NodeFromSchema<typeof TextAsTree.Tree>, TextAsTree.Tree>>
		>();
	});

	it("basic use", () => {
		const text = TextAsTree.Tree.fromString("hello");
		assert.equal(text.fullString(), "hello");
		assert.deepEqual([...text.characters()], ["h", "e", "l", "l", "o"]);
		text.insertAt(5, " world");
		assert.equal(text.fullString(), "hello world");
		text.removeRange(0, 6);
		assert.equal(text.fullString(), "world");
	});

	// TODO: Add tests for:
	// - inserting at invalid indices (negative, beyond length),
	// - removing with invalid indices or lengths,
	// - inserting empty strings,
	// - operations on empty text,
	// - concurrent insertions/removals.
});
