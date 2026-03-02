/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TreeAlpha } from "../../shared-tree/index.js";
import {
	allowUnused,
	TreeViewConfiguration,
	type NodeFromSchema,
} from "../../simple-tree/index.js";
// Allow importing file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { TextAsTree } from "../../text/textDomain.js";
import type { requireTrue, areSafelyAssignable } from "../../util/index.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { testSchemaCompatibilitySnapshots } from "../snapshots/index.js";
import { suitesWithAndWithoutProduction } from "../utils.js";

describe("textDomain", () => {
	it("compatibility", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: TextAsTree.Tree });
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.81.0", "text");
	});

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

	// Hydrated and unhydrated trees implement cursors differently which impacts observation tracking, so test both.
	// Specifically unhydrated tree cursors do observation tracking while hydrated ones do not.
	describeHydration("observation tracking", (init, hydrated) => {
		// Text has debug asserts which can add observations, so ensure tracking works with and without production build emulation.
		suitesWithAndWithoutProduction((emulateProduction) => {
			it("content observation", () => {
				const text = TextAsTree.Tree.fromString("hello");
				if (hydrated) {
					hydrateNode(text);
				}
				const log: string[] = [];
				TreeAlpha.trackObservationsOnce(
					() => log.push("fullString"),
					() => assert.equal(text.fullString(), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("characters"),
					() => assert.equal([...text.characters()].join(""), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("charactersCopy"),
					() => assert.equal(text.charactersCopy().join(""), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("characterCount"),
					() => assert.equal(text.characterCount(), 5),
				);
				assert.deepEqual(log, []);
				text.removeRange(2, 3);
				assert.deepEqual(log, [
					"fullString",
					"characters",
					"charactersCopy",
					"characterCount",
				]);
			});
		});
	});

	// TODO: Add tests for:
	// - inserting at invalid indices (negative, beyond length),
	// - removing with invalid indices or lengths,
	// - inserting empty strings,
	// - operations on empty text,
	// - concurrent insertions/removals.
});
