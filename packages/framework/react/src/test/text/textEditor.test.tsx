/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TextAsTree } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import { toPropTreeNode } from "../../propNode.js";
import { PlainTextMainView } from "../../text/index.js";

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

					assert.match(rendered.baseElement.textContent ?? "", /Hello World/);
				});

				it("invalidates view when tree is mutated", () => {
					const text = TextAsTree.Tree.fromString("Hello");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Mutate the tree by inserting text
					text.insertAt(5, " World");

					// Rerender and verify the view updates
					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /Hello World/);
				});

				it("invalidates view when text is removed", () => {
					const text = TextAsTree.Tree.fromString("Hello World");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Mutate the tree by removing " World" (indices 5 to 11)
					text.removeRange(5, 11);

					// Rerender and verify the view updates
					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /Hello/);
					assert(rendered.baseElement.textContent !== null);
					assert.doesNotMatch(rendered.baseElement.textContent, /World/);
				});

				it("invalidates view when text is cleared and replaced", () => {
					const text = TextAsTree.Tree.fromString("Original");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Clear all text
					const length = [...text.characters()].length;
					text.removeRange(0, length);

					// Insert new text
					text.insertAt(0, "Replaced");

					// Rerender and verify the view updates
					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /Replaced/);
					assert(rendered.baseElement.textContent !== null);
					assert.doesNotMatch(rendered.baseElement.textContent, /Original/);
				});

				// Tests for surrogate pair characters (emojis use 2 UTF-16 code units)
				// These verify correct handling where editor indexing may differ from iteration.

				it("renders MainView with surrogate pair characters", () => {
					// 😀 is a surrogate pair: "😀".length === 2, but [..."😀"].length === 1
					const text = TextAsTree.Tree.fromString("Hello 😀 World");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					assert.match(rendered.baseElement.textContent ?? "", /Hello 😀 World/);
				});

				it("inserts text after surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("A😀B");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Insert after the emoji (index 2 in character count: A, 😀, B)
					text.insertAt(2, "X");

					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /A😀XB/);
				});

				it("removes surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("A😀B");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Remove the emoji (index 1, length 1 in character count)
					text.removeRange(1, 2);

					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /AB/);
					assert(rendered.baseElement.textContent !== null);
					assert.doesNotMatch(rendered.baseElement.textContent, /😀/);
				});

				it("handles multiple surrogate pair characters", () => {
					const text = TextAsTree.Tree.fromString("👋🌍🎉");
					const content = <ViewComponent root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Insert between emojis
					text.insertAt(2, "!");

					rendered.rerender(content);
					assert.match(rendered.baseElement.textContent ?? "", /👋🌍!🎉/);
				});
			});
		}
	});
});
