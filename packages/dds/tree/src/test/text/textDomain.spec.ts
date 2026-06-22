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

	describeHydration("onCharactersChanged", (_init, hydrated) => {
		it("fires with insert ops when characters are added", () => {
			const text = TextAsTree.Tree.fromString("ab");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(1, "xy");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1 },
				{ type: "insert", text: "xy" },
			]);
		});

		it("fires with remove ops when characters are deleted", () => {
			const text = TextAsTree.Tree.fromString("abcde");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(1, 3);
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1 },
				{ type: "remove", count: 2 },
			]);
		});

		it("fires with insert and remove ops for a replace", () => {
			const text = TextAsTree.Tree.fromString("abcde");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(1, 3);
			text.insertAt(1, "XY");
			// Two separate edits → two callbacks.
			assert.equal(received.length, 2);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1 },
				{ type: "remove", count: 2 },
			]);
			assert.deepEqual(received[1], [
				{ type: "retain", count: 1 },
				{ type: "insert", text: "XY" },
			]);
		});

		it("fires for insert at start", () => {
			const text = TextAsTree.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(0, "X");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [{ type: "insert", text: "X" }]);
		});

		it("fires for insert at end", () => {
			const text = TextAsTree.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(3, "X");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 3 },
				{ type: "insert", text: "X" },
			]);
		});

		it("fires for remove all", () => {
			const text = TextAsTree.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly TextAsTree.TextOp[])[] = [];
			text.onCharactersChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(0, 3);
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [{ type: "remove", count: 3 }]);
		});

		// Empty inserts/removes are no-ops semantically. In hydrated trees they produce no change
		// notification at all; unhydrated trees fire the callback once with no real ops (a quirk of
		// the unhydrated event path), so we only assert the hydrated behavior here.
		it("does not fire for an empty insert (hydrated)", () => {
			if (!hydrated) return;
			const text = TextAsTree.Tree.fromString("abc");
			hydrateNode(text);
			let callCount = 0;
			text.onCharactersChanged(() => {
				callCount++;
			});
			text.insertAt(1, "");
			assert.equal(callCount, 0, "empty insert should not produce a change notification");
		});

		it("does not fire for an empty remove (hydrated)", () => {
			if (!hydrated) return;
			const text = TextAsTree.Tree.fromString("abc");
			hydrateNode(text);
			let callCount = 0;
			text.onCharactersChanged(() => {
				callCount++;
			});
			text.removeRange(1, 1);
			assert.equal(callCount, 0, "empty remove should not produce a change notification");
		});

		it("cleanup function unsubscribes the callback", () => {
			const text = TextAsTree.Tree.fromString("ab");
			if (hydrated) {
				hydrateNode(text);
			}
			let callCount = 0;
			const cleanup = text.onCharactersChanged(() => {
				callCount++;
			});
			text.insertAt(1, "x");
			assert.equal(callCount, 1);
			cleanup();
			text.insertAt(1, "y");
			assert.equal(callCount, 1, "callback should not fire after cleanup");
		});
	});

	// TODO: Add tests for:
	// - inserting at invalid indices (negative, beyond length),
	// - removing with invalid indices or lengths,
	// - inserting empty strings,
	// - operations on empty text,
	// - concurrent insertions/removals.
});
