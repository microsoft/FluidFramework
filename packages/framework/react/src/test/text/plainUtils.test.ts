/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TextAsTree } from "@fluidframework/tree/internal";
import {
	independentView,
	TreeViewConfiguration,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";

import { createUndoRedo } from "../../undoRedo.js";
// Allow import of file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { applyTextEdit, applyTextOps, computeSync } from "../../text/plain/plainUtils.js";

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
	});

	describe("applyTextEdit", () => {
		function createTextView(initial: string): TreeViewAlpha<typeof TextAsTree.Tree> {
			const view = independentView(new TreeViewConfiguration({ schema: TextAsTree.Tree }));
			view.initialize(TextAsTree.Tree.fromString(initial));
			return view;
		}

		it("applies the edit to an unhydrated (non-branch) node", () => {
			const root = TextAsTree.Tree.fromString("hello");
			applyTextEdit(root, "hello world");
			assert.equal(root.fullString(), "hello world");
		});

		it("wraps the edit in a transaction tagged with the given label when on a branch", () => {
			const view = createTextView("hello");
			const label = Symbol("editor");
			const manager = createUndoRedo(view);

			applyTextEdit(view.root, "hello world", label);
			assert.equal(view.root.fullString(), "hello world");

			// The edit was a single transaction tagged with `label`, so a label-scoped undo
			// reverts the whole edit in one step.
			assert(manager.canUndo(label));
			manager.undo(label);
			assert.equal(view.root.fullString(), "hello");
			manager.dispose();
		});

		it("defaults the transaction label to the root node when none is given", () => {
			const view = createTextView("hello");
			const manager = createUndoRedo(view);

			applyTextEdit(view.root, "hello world");

			// With no explicit label, the edit is tagged with `root` itself.
			assert(manager.canUndo(view.root));
			manager.undo(view.root);
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
