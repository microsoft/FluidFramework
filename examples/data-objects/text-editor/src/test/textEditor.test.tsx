/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { TextAsTree } from "../schema.js";
import { MainView } from "../view/index.js";

describe("textEditor", () => {
	describe("dom tests", () => {
		let cleanup: () => void;

		before(() => {
			cleanup = globalJsdom();
		});

		after(() => {
			cleanup();
		});

		// Run without strict mode to make sure it works in a normal production setup.
		// Run with strict mode to potentially detect additional issues.
		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				it("renders MainView with editor container", () => {
					const text = TextAsTree.Tree.fromString("");
					const content = <MainView root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Verify the app renders the editor header
					assert.match(rendered.baseElement.textContent ?? "", /Collaborative Text Editor/);
				});

				it("renders MainView with initial text content", () => {
					const text = TextAsTree.Tree.fromString("Hello World");
					const content = <MainView root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					const editorContainer = rendered.baseElement.querySelector(".ql-editor");
					assert(editorContainer !== null, "Editor container should exist");
				});

				it("invalidates view when tree is mutated", () => {
					const text = TextAsTree.Tree.fromString("Hello");
					const content = <MainView root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Verify the editor container exists
					const editorContainer = rendered.baseElement.querySelector(".ql-editor");
					assert(editorContainer !== null, "Editor container should exist");

					// Mutate the tree by inserting text
					text.insertAt(5, " World");

					// Rerender and verify the view updates
					rendered.rerender(content);
					assert.equal(text.fullString(), "Hello World");
				});

				it("invalidates view when text is removed", () => {
					const text = TextAsTree.Tree.fromString("Hello World");
					const content = <MainView root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Mutate the tree by removing " World" (indices 5 to 11)
					text.removeRange(5, 11);

					// Rerender and verify the tree state
					rendered.rerender(content);
					assert.equal(text.fullString(), "Hello");
				});

				it("invalidates view when text is cleared and replaced", () => {
					const text = TextAsTree.Tree.fromString("Original");
					const content = <MainView root={toPropTreeNode(text)} />;
					const rendered = render(content, { reactStrictMode });

					// Clear all text
					const length = [...text.characters()].length;
					text.removeRange(0, length);

					// Insert new text
					text.insertAt(0, "Replaced");

					// Rerender and verify the tree state
					rendered.rerender(content);
					assert.equal(text.fullString(), "Replaced");
				});
			});
		}
	});
});
