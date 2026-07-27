/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TextAsTree } from "@fluidframework/tree/internal";
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
		const text = TextAsTree.Tree.fromString("Hello");
		const { result } = renderHook(() => useTreeSynchronizedString(text));

		assert.equal(result.current.text, "Hello");
	});

	it("syncs character changes into the returned text", () => {
		const text = TextAsTree.Tree.fromString("Hello");
		const { result } = renderHook(() => useTreeSynchronizedString(text));

		act(() => text.insertAt(5, " World"));
		assert.equal(result.current.text, "Hello World");

		act(() => text.removeRange(0, 6));
		assert.equal(result.current.text, "World");
	});

	it("re-seeds the text when a different tree is bound", () => {
		const treeA = TextAsTree.Tree.fromString("A");
		const treeB = TextAsTree.Tree.fromString("B");
		const { result, rerender } = renderHook(({ tree }) => useTreeSynchronizedString(tree), {
			initialProps: { tree: treeA },
		});
		assert.equal(result.current.text, "A");

		rerender({ tree: treeB });
		assert.equal(result.current.text, "B");
	});

	describe("selection", () => {
		it("adjusts the tracked selection across edits", () => {
			const text = TextAsTree.Tree.fromString("Hello");
			// Caret after "Hello".
			const { result } = renderHook(() =>
				useTreeSynchronizedString(text, { start: 5, end: 5 }),
			);

			// Inserting before the selection shifts it right by the inserted length.
			act(() => text.insertAt(0, "Oh "));
			assert.equal(result.current.text, "Oh Hello");
			assert.deepEqual(result.current.selection, { start: 8, end: 8 });
		});

		it("collapses the selection to an empty range when its text is deleted", () => {
			const text = TextAsTree.Tree.fromString("Hello");
			// Select the whole word.
			const { result } = renderHook(() =>
				useTreeSynchronizedString(text, { start: 0, end: 5 }),
			);

			act(() => text.removeRange(0, 5));
			assert.equal(result.current.text, "");
			assert.deepEqual(result.current.selection, { start: 0, end: 0 });
		});

		it("pulls the selection back within bounds after a shrinking edit", () => {
			const text = TextAsTree.Tree.fromString("Hello World");
			// Select "World".
			const { result } = renderHook(() =>
				useTreeSynchronizedString(text, { start: 6, end: 11 }),
			);

			// Delete everything; the selection must not point past the new (empty) text.
			act(() => text.removeRange(0, 11));
			assert.equal(result.current.text, "");
			assert.deepEqual(result.current.selection, { start: 0, end: 0 });
		});

		it("leaves the selection undefined when none was provided", () => {
			const text = TextAsTree.Tree.fromString("Hello");
			const { result } = renderHook(() => useTreeSynchronizedString(text));

			assert.equal(result.current.selection, undefined);

			// The text still syncs, but no selection is fabricated after an edit.
			act(() => text.insertAt(5, " World"));
			assert.equal(result.current.text, "Hello World");
			assert.equal(result.current.selection, undefined);
		});
	});
});
