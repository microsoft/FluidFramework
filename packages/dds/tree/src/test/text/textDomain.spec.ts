/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { FieldKey, IForestSubscription, TreeChunk } from "../../core/index.js";
import {
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	ForestTypeOptimized,
	TreeAlpha,
	createIndependentTreeAlpha,
} from "../../shared-tree/index.js";
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

/** Minimal structural view of a chunk that may have child fields, for walking the chunk tree. */
type ChunkWithFields = TreeChunk & { readonly fields?: Map<FieldKey, TreeChunk[]> };

/**
 * Walks every chunk reachable from a chunked forest's roots and tallies the {@link UniformChunk}s.
 * @returns the number of `UniformChunk`s and the total number of nodes they hold.
 */
function tallyUniformChunks(forest: IForestSubscription): {
	uniformChunkCount: number;
	uniformNodeCount: number;
} {
	const roots = (forest as unknown as { readonly roots: ChunkWithFields }).roots;
	let uniformChunkCount = 0;
	let uniformNodeCount = 0;
	function walk(chunk: TreeChunk): void {
		if (chunk instanceof UniformChunk) {
			uniformChunkCount++;
			uniformNodeCount += chunk.topLevelLength;
		}
		const fields = (chunk as ChunkWithFields).fields;
		if (fields !== undefined) {
			for (const chunks of fields.values()) {
				for (const child of chunks) {
					walk(child);
				}
			}
		}
	}
	walk(roots);
	return { uniformChunkCount, uniformNodeCount };
}

/**
 * Reaches the internal forest backing a view. The view is a `SchematizingSimpleTreeView` whose
 * `checkout` exposes the `IForestSubscription`. This is an intentional internal coupling — the public
 * API hides the forest — but this test needs it to inspect chunk storage.
 */
function forestFromView(view: object): IForestSubscription {
	return (view as { readonly checkout: { readonly forest: IForestSubscription } }).checkout
		.forest;
}

/** Builds an empty text document backed by the optimized (chunked) forest, exposing its forest. */
function buildChunkedTextDocument(): {
	readonly root: TextAsTree.Tree;
	readonly forest: IForestSubscription;
} {
	const view = createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
		new TreeViewConfiguration({ schema: TextAsTree.Tree }),
	);
	view.initialize(TextAsTree.Tree.fromString(""));
	return { root: view.root, forest: forestFromView(view) };
}

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

	// Regression test for the attach/detach coalescing in the chunked forest. Typing characters one at a
	// time attaches each as its own chunk; `coalesceUniformChunks` merges the same-shape neighbors back
	// together so the field stays batched into a small number of multi-node UniformChunks instead of
	// fragmenting into one chunk per character.
	describe("chunked forest storage", () => {
		it("batches typed characters into multi-node chunks", () => {
			const size = 1000;
			const { root, forest } = buildChunkedTextDocument();

			for (let i = 0; i < size; i++) {
				const middle = Math.floor(root.characterCount() / 2);
				root.insertAt(middle, i % 2 === 0 ? "a" : "b");
			}

			// All the typed content is present and stored in UniformChunks (nothing shattered away).
			assert.equal(root.characterCount(), size);
			const { uniformChunkCount, uniformNodeCount } = tallyUniformChunks(forest);
			assert.equal(uniformNodeCount, size);
			assert(
				uniformChunkCount < uniformNodeCount,
				`expected coalescing to batch content into multi-node chunks, but found ${uniformChunkCount} UniformChunks for ${uniformNodeCount} nodes (no batching)`,
			);
		});
	});

	// TODO: Add tests for:
	// - inserting at invalid indices (negative, beyond length),
	// - removing with invalid indices or lengths,
	// - inserting empty strings,
	// - operations on empty text,
	// - concurrent insertions/removals.
});
