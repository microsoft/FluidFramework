/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TextAsTree } from "@fluidframework/tree/internal";
import { act, render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import { toPropTreeNode } from "../../propNode.js";
import { PlainTextMainView } from "../../text/index.js";
import type { UndoRedo } from "../../undoRedo.js";

/** Read the current value of the editor's `<textarea>`. */
function getTextareaValue(container: HTMLElement): string {
	const textarea = container.querySelector("textarea");
	assert.ok(textarea, "Textarea should be present");
	return textarea.value;
}

describe("Plain TextArea view", () => {
	let cleanup: () => void;
	before(() => {
		cleanup = globalJsdom();
	});
	after(() => {
		cleanup();
	});

	describe("dom tests", () => {
		// Run without strict mode to make sure it works in a normal production setup.
		// Run with strict mode to potentially detect additional issues.
		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				const ViewComponent = PlainTextMainView;

				it("renders MainView with editor container", () => {
					const text = TextAsTree.Tree.fromString("");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					assert.ok(
						rendered.container.querySelector("textarea"),
						"Textarea should be present after mount",
					);
				});

				it("renders MainView with initial text content", () => {
					const text = TextAsTree.Tree.fromString("Hello World");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					assert.equal(getTextareaValue(rendered.container), "Hello World");
				});

				it("invalidates view when tree is mutated", () => {
					const text = TextAsTree.Tree.fromString("Hello");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Mutate the tree; the controlled textarea updates from the hook's synced text.
					act(() => text.insertAt(5, " World"));

					assert.equal(getTextareaValue(rendered.container), "Hello World");
				});

				it("invalidates view when text is removed", () => {
					const text = TextAsTree.Tree.fromString("Hello World");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Mutate the tree by removing " World" (indices 5 to 11)
					act(() => text.removeRange(5, 11));

					assert.equal(getTextareaValue(rendered.container), "Hello");
				});

				it("invalidates view when text is cleared and replaced", () => {
					const text = TextAsTree.Tree.fromString("Original");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					act(() => {
						const length = [...text.characters()].length;
						text.removeRange(0, length);
						text.insertAt(0, "Replaced");
					});

					assert.equal(getTextareaValue(rendered.container), "Replaced");
				});

				// Tests for surrogate pair characters (emojis use 2 UTF-16 code units)
				// These verify correct handling where editor indexing may differ from iteration.

				it("renders MainView with surrogate pair characters", () => {
					// 😀 is a surrogate pair: "😀".length === 2, but [..."😀"].length === 1
					const text = TextAsTree.Tree.fromString("Hello 😀 World");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					assert.equal(getTextareaValue(rendered.container), "Hello 😀 World");
				});

				it("inserts text after surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("A😀B");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Insert after the emoji (index 2 in character count: A, 😀, B)
					act(() => text.insertAt(2, "X"));

					assert.equal(getTextareaValue(rendered.container), "A😀XB");
				});

				it("removes surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("A😀B");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Remove the emoji (index 1, length 1 in character count)
					act(() => text.removeRange(1, 2));

					assert.equal(getTextareaValue(rendered.container), "AB");
				});

				it("handles multiple surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("👋🌍🎉");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Insert between emojis
					act(() => text.insertAt(2, "!"));

					assert.equal(getTextareaValue(rendered.container), "👋🌍!🎉");
				});
			});
		}
	});

	describe("toolbar", () => {
		const mockLabel = Symbol("test");
		const mockUndoRedo: UndoRedo = {
			undo: () => {},
			redo: () => {},
			canUndo: () => false,
			canRedo: () => false,
			dispose: () => {},
		};

		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				it("does not render a toolbar when undoRedo is not provided", () => {
					const text = TextAsTree.Tree.fromString("");
					const rendered = render(<PlainTextMainView root={toPropTreeNode(text)} />, {
						reactStrictMode,
					});

					assert.equal(
						rendered.container.querySelector(".pt-toolbar"),
						// eslint-disable-next-line unicorn/no-null -- null is what the API returns when the element is not found, which is what we want to verify here.
						null,
						"Toolbar should not be present when undoRedo is not provided",
					);
				});

				it("renders toolbar with undo and redo buttons when undoRedo is provided", () => {
					const text = TextAsTree.Tree.fromString("");
					const rendered = render(
						<PlainTextMainView
							root={toPropTreeNode(text)}
							undoRedo={mockUndoRedo}
							editLabel={mockLabel}
						/>,
						{ reactStrictMode },
					);

					assert.ok(
						rendered.container.querySelector(".pt-toolbar"),
						"Toolbar should be present when undoRedo is provided",
					);
					assert.ok(
						rendered.container.querySelector(".pt-undo"),
						"Undo button should be present when undoRedo is provided",
					);
					assert.ok(
						rendered.container.querySelector(".pt-redo"),
						"Redo button should be present when undoRedo is provided",
					);
				});
			});
		}
	});
});
