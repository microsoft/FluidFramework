/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TextAsTree, TreeAlpha } from "@fluidframework/tree/internal";
import {
	independentView,
	TreeViewConfiguration,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";

import { createUndoRedo } from "../../undoRedo.js";
/* eslint-disable import-x/no-internal-modules -- Allow import of the file being tested. */
import {
	applyTextOps,
	collapseSelectionOnReread,
	computeSync,
	syncTextToTree,
} from "../../text/plain/plainUtils.js";
/* eslint-enable import-x/no-internal-modules */

describe("plainUtils", () => {
	describe("applyTextOps", () => {
		it("inserts text, leaving the selection start before the edit and extending the end past it", () => {
			// "hello" with selection "el" (1-3); insert "XX" at index 2, inside the selection.
			// start (before the insert) is unchanged; end (after it) shifts by the inserted length.
			const result = applyTextOps("hello", { start: 1, end: 3 }, [
				{ type: "retain", count: 2 },
				{ type: "insert", text: "XX" },
				{ type: "retain", count: 3 },
			]);
			assert.deepEqual(result, { value: "heXXllo", selection: { start: 1, end: 5 } });
		});

		it("removes text, clamping a selection start inside the removal and pulling back the end after it", () => {
			// "hello" with selection "llo" (2-5); remove "ell" (1-4).
			// start sits inside the removal and clamps to its start; end is past it and pulls back.
			const result = applyTextOps("hello", { start: 2, end: 5 }, [
				{ type: "retain", count: 1 },
				{ type: "remove", count: 3 },
				{ type: "retain", count: 1 },
			]);
			assert.deepEqual(result, { value: "ho", selection: { start: 1, end: 2 } });
		});

		it("treats op counts as code points, not UTF-16 units, for astral characters", () => {
			// "😀" is one code point but two UTF-16 units. Retain it, then insert after.
			const value = "😀x";
			// Cursor was at end (3 UTF-16 units); the insert is before it, so it shifts by 1.
			const result = applyTextOps(value, { start: value.length, end: value.length }, [
				{ type: "retain", count: 1 },
				{ type: "insert", text: "Y" },
				{ type: "retain", count: 1 },
			]);
			assert.deepEqual(result, { value: "😀Yx", selection: { start: 4, end: 4 } });
		});

		it("appends the tail of the old value not covered by trailing ops", () => {
			const result = applyTextOps("hello", { start: 0, end: 0 }, [
				{ type: "retain", count: 2 },
			]);
			assert.deepEqual(result, { value: "hello", selection: { start: 0, end: 0 } });
		});

		it("clamps a stale selection that lands outside the new value", () => {
			// Selection points past the end of oldValue; after a shrinking edit it must not exceed value.length.
			const result = applyTextOps("hello", { start: 10, end: 10 }, [
				{ type: "remove", count: 3 },
				{ type: "retain", count: 2 },
			]);
			assert.deepEqual(result, { value: "lo", selection: { start: 2, end: 2 } });
		});

		it("collapses a selection to a caret when its whole range is removed", () => {
			// "abcdef" with selection "cd" (2-4); remove "bcde" (1-5), which fully contains the selection.
			// Both offsets pull back to the removal start, leaving a collapsed caret.
			const result = applyTextOps("abcdef", { start: 2, end: 4 }, [
				{ type: "retain", count: 1 },
				{ type: "remove", count: 4 },
				{ type: "retain", count: 1 },
			]);
			assert.deepEqual(result, { value: "af", selection: { start: 1, end: 1 } });
		});

		it("leaves a selection unchanged when the edit is entirely after it", () => {
			// "abcdef" with selection "a" (0-1); remove "de" (3-5), which is past the selection.
			const result = applyTextOps("abcdef", { start: 0, end: 1 }, [
				{ type: "retain", count: 3 },
				{ type: "remove", count: 2 },
				{ type: "retain", count: 1 },
			]);
			assert.deepEqual(result, { value: "abcf", selection: { start: 0, end: 1 } });
		});

		it("shifts a collapsed caret right when text is inserted before it", () => {
			// "ab" with a collapsed caret at the end (2); insert "XYZ" at the caret.
			const result = applyTextOps("ab", { start: 2, end: 2 }, [
				{ type: "retain", count: 2 },
				{ type: "insert", text: "XYZ" },
			]);
			assert.deepEqual(result, { value: "abXYZ", selection: { start: 5, end: 5 } });
		});
	});

	describe("collapseSelectionOnReread", () => {
		it("returns undefined when no selection is tracked", () => {
			assert.equal(collapseSelectionOnReread(undefined, 5), undefined);
		});

		it("collapses a range to a caret at its start, rather than preserving the range", () => {
			// The whole point of the policy: a range must NOT survive the reread as a range, even when
			// both offsets still fit in the new text (which is where independent clamping went wrong).
			assert.deepEqual(collapseSelectionOnReread({ start: 0, end: 5 }, 7), {
				start: 0,
				end: 0,
			});
		});

		it("clamps the caret into the new (shorter) text", () => {
			assert.deepEqual(collapseSelectionOnReread({ start: 10, end: 12 }, 3), {
				start: 3,
				end: 3,
			});
		});

		it("keeps an already-collapsed caret in place when still in range", () => {
			assert.deepEqual(collapseSelectionOnReread({ start: 2, end: 2 }, 5), {
				start: 2,
				end: 2,
			});
		});
	});

	describe("syncTextToTree", () => {
		function createTextView(initial: string): TreeViewAlpha<typeof TextAsTree.Tree> {
			const view = independentView(new TreeViewConfiguration({ schema: TextAsTree.Tree }));
			view.initialize(TextAsTree.Tree.fromString(initial));
			return view;
		}

		it("replaces the tree's content with the new text", () => {
			const root = TextAsTree.Tree.fromString("hello");
			syncTextToTree(root, "hello world");
			assert.equal(root.fullString(), "hello world");
		});

		it("is atomically undoable when wrapped in a labeled transaction", () => {
			const view = createTextView("hello");
			const label = Symbol("editor");
			const manager = createUndoRedo(view);

			// The reference pattern used by callers: wrap the sync in a labeled transaction so the
			// remove + insert pair is reverted together in a single undo step.
			TreeAlpha.context(view.root).runTransaction(
				() => syncTextToTree(view.root, "hello world"),
				{
					label,
				},
			);
			assert.equal(view.root.fullString(), "hello world");

			assert(manager.canUndo(label));
			manager.undo(label);
			assert.equal(view.root.fullString(), "hello");
			manager.dispose();
		});
	});

	describe("computeSync", () => {
		/**
		 * Calls computeSync, applies the returned ops to a copy of `existing`,
		 * asserts the result equals `final`, and returns the ops for further assertions.
		 */
		function computeSyncAndValidate<T>(
			existing: readonly T[],
			final: readonly T[],
		): ReturnType<typeof computeSync<T>> {
			const ops = computeSync(existing, final);
			const result = [...existing];
			if (ops.remove) {
				result.splice(ops.remove.start, ops.remove.end - ops.remove.start);
			}
			if (ops.insert) {
				result.splice(ops.insert.location, 0, ...ops.insert.slice);
			}
			assert.deepEqual(result, [...final]);
			return ops;
		}

		it("works for two empty arrays", () => {
			computeSyncAndValidate([], []);
		});

		it("returns no ops for identical arrays", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
			assert.equal(ops.insert, undefined);
		});

		it("inserts all elements when existing is empty", () => {
			computeSyncAndValidate([], ["a", "b", "c"]);
		});

		it("removes all elements when final is empty", () => {
			computeSyncAndValidate(["a", "b", "c"], []);
		});

		it("replaces all elements when arrays are completely different", () => {
			computeSyncAndValidate(["a", "b"], ["c", "d"]);
		});

		it("appends element to end", () => {
			const ops = computeSyncAndValidate(["a", "b"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes element from end", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["a", "b"]);
			assert.equal(ops.insert, undefined);
		});

		it("prepends element at start", () => {
			const ops = computeSyncAndValidate(["b", "c"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes element from start", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["b", "c"]);
			assert.equal(ops.insert, undefined);
		});

		it("replaces middle section", () => {
			const ops = computeSyncAndValidate(["a", "b", "c", "d"], ["a", "x", "y", "d"]);
			assert.deepEqual(ops.remove, { start: 1, end: 3 });
			assert.deepEqual(ops.insert, { location: 1, slice: ["x", "y"] });
		});

		it("inserts into the middle of an existing array", () => {
			const ops = computeSyncAndValidate(["a", "d"], ["a", "b", "c", "d"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes from the middle of an existing array", () => {
			const ops = computeSyncAndValidate(["a", "b", "c", "d"], ["a", "d"]);
			assert.equal(ops.insert, undefined);
		});
	});
});
