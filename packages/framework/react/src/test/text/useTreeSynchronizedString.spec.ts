/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { independentView, TreeViewConfiguration } from "@fluidframework/tree/alpha";
import { PlainText } from "@fluidframework/tree/internal";
import { act, renderHook } from "@testing-library/react";
import globalJsdom from "global-jsdom";

// Allow import of the file being tested; the hook is not re-exported from text/index.
// eslint-disable-next-line import-x/no-internal-modules
import { useTreeSynchronizedString } from "../../text/plain/useTreeSynchronizedString.js";

describe("useTreeSynchronizedString", () => {
	let cleanup: () => void;
	before(() => {
		cleanup = globalJsdom();
	});
	after(() => {
		cleanup();
	});

	it("returns the tree's current text", () => {
		const text = PlainText.Tree.fromString("Hello");
		const { result } = renderHook(() => useTreeSynchronizedString(text));

		assert.equal(result.current.text, "Hello");
	});

	it("syncs character changes into the returned text", () => {
		const text = PlainText.Tree.fromString("Hello");
		const { result } = renderHook(() => useTreeSynchronizedString(text));

		act(() => text.insertAt(5, " World"));
		assert.equal(result.current.text, "Hello World");

		act(() => text.removeRange(0, 6));
		assert.equal(result.current.text, "World");
	});

	it("re-seeds the text when a different tree is bound", () => {
		const treeA = PlainText.Tree.fromString("A");
		const treeB = PlainText.Tree.fromString("B");
		const { result, rerender } = renderHook(({ tree }) => useTreeSynchronizedString(tree), {
			initialProps: { tree: treeA },
		});
		assert.equal(result.current.text, "A");

		rerender({ tree: treeB });
		assert.equal(result.current.text, "B");
	});

	describe("selection", () => {
		it("extends a range when text is inserted inside it", () => {
			// "hello" with selection "el" (1-3); insert "XX" at index 2, inside the selection.
			// start (before the insert) is unchanged; end (after it) shifts by the inserted length.
			const text = PlainText.Tree.fromString("hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 1, end: 3 }));

			act(() => text.insertAt(2, "XX"));
			assert.equal(result.current.text, "heXXllo");
			assert.deepEqual(result.current.selection, { start: 1, end: 5 });
		});

		it("clamps an endpoint inside a removal and shifts an endpoint after it", () => {
			// "hello" with selection "llo" (2-5); remove "ell" (1-4).
			// start sits inside the removal and clamps to its start; end is past it and pulls back.
			const text = PlainText.Tree.fromString("hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 2, end: 5 }));

			act(() => text.removeRange(1, 4));
			assert.equal(result.current.text, "ho");
			assert.deepEqual(result.current.selection, { start: 1, end: 2 });
		});

		it("adjusts the tracked selection across edits", () => {
			const text = PlainText.Tree.fromString("Hello");
			// Caret after "Hello".
			const { result } = renderHook(() =>
				useTreeSynchronizedString(text, { start: 5, end: 5 }),
			);
			assert.deepEqual(result.current.selection, { start: 5, end: 5 });

			// Inserting before the selection shifts it right by the inserted length.
			act(() => text.insertAt(0, "Oh "));
			assert.equal(result.current.text, "Oh Hello");
			assert.deepEqual(result.current.selection, { start: 8, end: 8 });
		});

		it("collapses a range to an empty selection when its whole range is removed", () => {
			// "abcdef" with selection "cd" (2-4); remove "bcde" (1-5), which fully contains the selection.
			// Both offsets pull back to the removal start, leaving an empty selection.
			const text = PlainText.Tree.fromString("abcdef");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 2, end: 4 }));

			act(() => text.removeRange(1, 5));
			assert.equal(result.current.text, "af");
			assert.deepEqual(result.current.selection, { start: 1, end: 1 });
		});

		it("pulls the selection back within bounds after a shrinking edit", () => {
			const text = PlainText.Tree.fromString("Hello World");
			// Select "World".
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 6, end: 11 }));

			// Delete everything; the selection must not point past the new (empty) text.
			act(() => text.removeRange(0, 11));
			assert.equal(result.current.text, "");
			assert.deepEqual(result.current.selection, { start: 0, end: 0 });
		});

		it("clamps a stale selection to the text bounds", () => {
			// Selection points past the end of oldValue; after a shrinking edit it must not exceed value.length.
			const text = PlainText.Tree.fromString("hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 10, end: 10 }));

			act(() => text.removeRange(0, 3));
			assert.equal(result.current.text, "lo");
			assert.deepEqual(result.current.selection, { start: 2, end: 2 });
		});

		it("leaves a selection unchanged when the edit is entirely after it", () => {
			// "abcdef" with selection "a" (0-1); remove "de" (3-5), which is past the selection.
			const text = PlainText.Tree.fromString("abcdef");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 0, end: 1 }));

			act(() => text.removeRange(3, 5));
			assert.equal(result.current.text, "abcf");
			assert.deepEqual(result.current.selection, { start: 0, end: 1 });
		});

		it("shifts a caret past text inserted at its position", () => {
			// "ab" with an empty selection at the end (2); insert "XYZ" at that position.
			const text = PlainText.Tree.fromString("ab");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 2, end: 2 }));

			act(() => text.insertAt(2, "XYZ"));
			assert.equal(result.current.text, "abXYZ");
			assert.deepEqual(result.current.selection, { start: 5, end: 5 });
		});

		it("leaves the selection undefined when none was provided", () => {
			const text = PlainText.Tree.fromString("Hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));

			assert.equal(result.current.selection, undefined);

			// The text still syncs, but no selection is fabricated after an edit.
			act(() => text.insertAt(5, " World"));
			assert.equal(result.current.text, "Hello World");
			assert.equal(result.current.selection, undefined);
		});

		it("stops tracking after the selection is cleared", () => {
			const text = PlainText.Tree.fromString("Hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			act(() => result.current.setSelection({ start: 5, end: 5 }));
			assert.deepEqual(result.current.selection, { start: 5, end: 5 });

			act(() => result.current.setSelection(undefined));
			act(() => text.insertAt(0, "Oh "));
			assert.equal(result.current.selection, undefined);
		});

		it("tracks textarea offsets around surrogate pairs", () => {
			// "😀" is one code point but two UTF-16 units. Retain it, then insert after.
			const value = "😀x";
			const text = PlainText.Tree.fromString(value);
			const { result } = renderHook(() => useTreeSynchronizedString(text));
			// Cursor was at end (3 UTF-16 units); the insert is before it, so it shifts by 1.
			act(() => result.current.setSelection({ start: value.length, end: value.length }));

			act(() => text.insertAt(1, "Y"));
			assert.equal(result.current.text, "😀Yx");
			assert.deepEqual(result.current.selection, { start: 4, end: 4 });
		});

		it("tracks selection anchors in a hydrated tree", () => {
			const view = independentView(new TreeViewConfiguration({ schema: PlainText.Tree }));
			view.initialize(PlainText.Tree.fromString("hello"));
			const { result } = renderHook(() => useTreeSynchronizedString(view.root));
			act(() => result.current.setSelection({ start: 1, end: 3 }));

			act(() => view.root.insertAt(2, "XX"));
			assert.equal(result.current.text, "heXXllo");
			assert.deepEqual(result.current.selection, { start: 1, end: 5 });
		});
	});
});
