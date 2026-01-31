/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
import { independentView } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import * as React from "react";

import {
	FormattedTextAsTree,
	FormattedMainView,
	type FormattedEditorHandle,
} from "../formatted/quillFormattedView.js";
import {
	PlainTextMainView,
	QuillMainView,
	TextAsTree,
	type MainViewProps,
} from "../plain/index.js";

// Configuration for creating formatted text views
const formattedTreeConfig = new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree });

/**
 * Creates a TreeView for formatted text, initialized with the provided initial value.
 * Returns the tree for direct manipulation and treeView for events.
 */
function createFormattedTreeView(initialValue = ""): {
	tree: FormattedTextAsTree.Tree;
	treeView: TreeView<typeof FormattedTextAsTree.Tree>;
} {
	const treeView = independentView(formattedTreeConfig);
	treeView.initialize(FormattedTextAsTree.Tree.fromString(initialValue));
	return { tree: treeView.root, treeView };
}

const views: { name: string; component: React.FC<MainViewProps> }[] = [
	{ name: "Quill", component: QuillMainView },
	{ name: "Plain TextArea", component: PlainTextMainView },
];

// TODO add collaboration tests when rich formatting is supported using TestContainerRuntimeFactory from
// @fluidframework/test-utils to test rich formatting data sync between multiple collaborators
describe("textEditor", () => {
	// Note: JSDOM is initialized once in mochaHooks.mjs before Quill is imported,
	// since Quill requires document at import time. DOM state may accumulate
	// across tests. See src/test/mochaHooks.mjs.

	// Loop through all registered views
	for (const view of views) {
		describe(`${view.name} view`, () => {
			describe("dom tests", () => {
				// Run without strict mode to make sure it works in a normal production setup.
				// Run with strict mode to potentially detect additional issues.
				for (const reactStrictMode of [false, true]) {
					describe(`StrictMode: ${reactStrictMode}`, () => {
						const ViewComponent = view.component;

						it("renders MainView with editor container", () => {
							const text = TextAsTree.Tree.fromString("");
							const content = <ViewComponent root={toPropTreeNode(text)} />;
							const rendered = render(content, { reactStrictMode });

							assert.match(
								rendered.baseElement.textContent ?? "",
								/Collaborative Text Editor/,
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
							assert.doesNotMatch(rendered.baseElement.textContent ?? "", /World/);
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
							assert.doesNotMatch(rendered.baseElement.textContent ?? "", /Original/);
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
							assert.doesNotMatch(rendered.baseElement.textContent ?? "", /😀/);
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
	}

	// Formatted text view tests - Initial view rendering (matching plain text test structure)
	describe("Formatted Quill view", () => {
		describe("dom tests", () => {
			for (const reactStrictMode of [false, true]) {
				describe(`StrictMode: ${reactStrictMode}`, () => {
					it("renders FormattedMainView with editor container", () => {
						const { tree, treeView } = createFormattedTreeView();
						const content = (
							<FormattedMainView
								root={toPropTreeNode(tree)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						assert.match(
							rendered.baseElement.textContent ?? "",
							/Collaborative Formatted Text Editor/,
						);
					});

					it("renders FormattedMainView with initial text content", () => {
						const { tree, treeView } = createFormattedTreeView("Hello World");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(tree)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						assert.match(rendered.baseElement.textContent ?? "", /Hello World/);
					});

					it("invalidates view when tree is mutated", () => {
						const { tree: text, treeView } = createFormattedTreeView("Hello");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Mutate the tree by inserting text
						text.insertAt(5, " World");

						// Rerender and verify the view updates
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /Hello World/);
					});

					it("invalidates view when text is removed", () => {
						const { tree: text, treeView } = createFormattedTreeView("Hello World");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Mutate the tree by removing " World" (indices 5 to 11)
						text.removeRange(5, 11);

						// Rerender and verify the view updates
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /Hello/);
						assert.doesNotMatch(rendered.baseElement.textContent ?? "", /World/);
					});

					it("invalidates view when text is cleared and replaced", () => {
						const { tree: text, treeView } = createFormattedTreeView("Original");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Clear all text
						const length = [...text.characters()].length;
						text.removeRange(0, length);

						// Insert new text
						text.insertAt(0, "Replaced");

						// Rerender and verify the view updates
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /Replaced/);
						assert.doesNotMatch(rendered.baseElement.textContent ?? "", /Original/);
					});

					// Tests for surrogate pair characters (emojis use 2 UTF-16 code units)
					// These verify correct handling where editor indexing may differ from iteration.

					it("renders FormattedMainView with surrogate pair characters", () => {
						// 😀 is a surrogate pair: "😀".length === 2, but [..."😀"].length === 1
						const { tree: text, treeView } = createFormattedTreeView("Hello 😀 World");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						assert.match(rendered.baseElement.textContent ?? "", /Hello 😀 World/);
					});

					it("inserts text after surrogate pair characters", () => {
						const { tree: text, treeView } = createFormattedTreeView("A😀B");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Insert after the emoji (index 2 in character count: A, 😀, B)
						text.insertAt(2, "X");

						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /A😀XB/);
					});

					it("removes surrogate pair characters", () => {
						const { tree: text, treeView } = createFormattedTreeView("A😀B");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Remove the emoji (index 1, length 1 in character count)
						text.removeRange(1, 2);

						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /AB/);
						assert.doesNotMatch(rendered.baseElement.textContent ?? "", /😀/);
					});

					it("handles multiple surrogate pair characters", () => {
						const { tree: text, treeView } = createFormattedTreeView("👋🌍🎉");
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Insert between emojis
						text.insertAt(2, "!");

						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /👋🌍!🎉/);
					});
				});
			}
		});

		// Helper to create default format
		function createPlainFormat(): FormattedTextAsTree.CharacterFormat {
			return new FormattedTextAsTree.CharacterFormat({
				bold: false,
				italic: false,
				underline: false,
				size: 12,
				font: "Arial",
			});
		}

		// Essential tests for character attributes
		// Each attribute needs: insert, delete, and formatRange tests
		describe("character attribute tests", () => {
			for (const reactStrictMode of [false, true]) {
				describe(`StrictMode: ${reactStrictMode}`, () => {
					it("delete on empty string does not throw", () => {
						const { tree: text, treeView } = createFormattedTreeView();
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						assert.doesNotThrow(() => {
							text.removeRange(0, 0);
							rendered.rerender(content);
						});
					});

					describe("bold", () => {
						it("inserts bold text and renders with <strong> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(!rendered.container.querySelector("strong"), "Initially: no <strong>");

							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: true,
								italic: false,
								underline: false,
								size: 12,
								font: "Arial",
							});
							text.insertAt(2, "BOLD");

							rendered.rerender(content);
							const el = rendered.container.querySelector("strong");
							assert.ok(el, "Expected <strong> tag");
							assert.match(el.textContent ?? "", /BOLD/);
						});

						it("deletes bold text and removes <strong> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView();
							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: true,
								italic: false,
								underline: false,
								size: 12,
								font: "Arial",
							});
							text.insertAt(0, "BOLD");
							text.defaultFormat = createPlainFormat();
							text.insertAt(4, "plain");

							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(rendered.container.querySelector("strong"), "Initially: has <strong>");

							text.removeRange(0, 4);
							rendered.rerender(content);

							assert.ok(
								!rendered.container.querySelector("strong"),
								"After delete: no <strong>",
							);
						});

						it("applies bold via formatRange", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello World");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							text.formatRange(6, 5, { bold: true });
							rendered.rerender(content);

							const el = rendered.container.querySelector("strong");
							assert.ok(el, "Expected <strong> after formatRange");
							assert.match(el.textContent ?? "", /World/);
						});
					});

					describe("italic", () => {
						it("inserts italic text and renders with <em> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(!rendered.container.querySelector("em"), "Initially: no <em>");

							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: true,
								underline: false,
								size: 12,
								font: "Arial",
							});
							text.insertAt(2, "ITAL");

							rendered.rerender(content);
							const el = rendered.container.querySelector("em");
							assert.ok(el, "Expected <em> tag");
							assert.match(el.textContent ?? "", /ITAL/);
						});

						it("deletes italic text and removes <em> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView();
							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: true,
								underline: false,
								size: 12,
								font: "Arial",
							});
							text.insertAt(0, "ITAL");
							text.defaultFormat = createPlainFormat();
							text.insertAt(4, "plain");

							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(rendered.container.querySelector("em"), "Initially: has <em>");

							text.removeRange(0, 4);
							rendered.rerender(content);

							assert.ok(!rendered.container.querySelector("em"), "After delete: no <em>");
						});

						it("applies italic via formatRange", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello World");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							text.formatRange(6, 5, { italic: true });
							rendered.rerender(content);

							const el = rendered.container.querySelector("em");
							assert.ok(el, "Expected <em> after formatRange");
							assert.match(el.textContent ?? "", /World/);
						});
					});

					describe("underline", () => {
						it("inserts underlined text and renders with <u> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(!rendered.container.querySelector("u"), "Initially: no <u>");

							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: true,
								size: 12,
								font: "Arial",
							});
							text.insertAt(2, "UNDER");

							rendered.rerender(content);
							const el = rendered.container.querySelector("u");
							assert.ok(el, "Expected <u> tag");
							assert.match(el.textContent ?? "", /UNDER/);
						});

						it("deletes underlined text and removes <u> tag", () => {
							const { tree: text, treeView } = createFormattedTreeView();
							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: true,
								size: 12,
								font: "Arial",
							});
							text.insertAt(0, "UNDER");
							text.defaultFormat = createPlainFormat();
							text.insertAt(5, "plain");

							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(rendered.container.querySelector("u"), "Initially: has <u>");

							text.removeRange(0, 5);
							rendered.rerender(content);

							assert.ok(!rendered.container.querySelector("u"), "After delete: no <u>");
						});

						it("applies underline via formatRange", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello World");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							text.formatRange(6, 5, { underline: true });
							rendered.rerender(content);

							const el = rendered.container.querySelector("u");
							assert.ok(el, "Expected <u> after formatRange");
							assert.match(el.textContent ?? "", /World/);
						});
					});

					describe("size", () => {
						it("inserts huge size text and renders with .ql-size-huge", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(
								!rendered.container.querySelector(".ql-size-huge"),
								"Initially: no .ql-size-huge",
							);

							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: false,
								size: 24,
								font: "Arial",
							});
							text.insertAt(2, "HUGE");

							rendered.rerender(content);
							const el = rendered.container.querySelector(".ql-size-huge");
							assert.ok(el, "Expected .ql-size-huge");
							assert.match(el.textContent ?? "", /HUGE/);
						});

						it("deletes huge size text and removes .ql-size-huge", () => {
							const { tree: text, treeView } = createFormattedTreeView();
							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: false,
								size: 24,
								font: "Arial",
							});
							text.insertAt(0, "HUGE");
							text.defaultFormat = createPlainFormat();
							text.insertAt(4, "plain");

							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(
								rendered.container.querySelector(".ql-size-huge"),
								"Initially: has .ql-size-huge",
							);

							text.removeRange(0, 4);
							rendered.rerender(content);

							assert.ok(
								!rendered.container.querySelector(".ql-size-huge"),
								"After delete: no .ql-size-huge",
							);
						});

						it("applies size via formatRange", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello World");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							text.formatRange(6, 5, { size: 24 });
							rendered.rerender(content);

							const el = rendered.container.querySelector(".ql-size-huge");
							assert.ok(el, "Expected .ql-size-huge after formatRange");
							assert.match(el.textContent ?? "", /World/);
						});
					});

					describe("font", () => {
						it("inserts monospace font text and renders with .ql-font-monospace", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(
								!rendered.container.querySelector(".ql-font-monospace"),
								"Initially: no .ql-font-monospace",
							);

							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: false,
								size: 12,
								font: "monospace",
							});
							text.insertAt(2, "MONO");

							rendered.rerender(content);
							const el = rendered.container.querySelector(".ql-font-monospace");
							assert.ok(el, "Expected .ql-font-monospace");
							assert.match(el.textContent ?? "", /MONO/);
						});

						it("deletes monospace font text and removes .ql-font-monospace", () => {
							const { tree: text, treeView } = createFormattedTreeView();
							text.defaultFormat = new FormattedTextAsTree.CharacterFormat({
								bold: false,
								italic: false,
								underline: false,
								size: 12,
								font: "monospace",
							});
							text.insertAt(0, "MONO");
							text.defaultFormat = createPlainFormat();
							text.insertAt(4, "plain");

							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							assert.ok(
								rendered.container.querySelector(".ql-font-monospace"),
								"Initially: has .ql-font-monospace",
							);

							text.removeRange(0, 4);
							rendered.rerender(content);

							assert.ok(
								!rendered.container.querySelector(".ql-font-monospace"),
								"After delete: no .ql-font-monospace",
							);
						});

						it("applies font via formatRange", () => {
							const { tree: text, treeView } = createFormattedTreeView("Hello World");
							const content = (
								<FormattedMainView
									root={toPropTreeNode(text)}
									treeViewEvents={treeView.events}
								/>
							);
							const rendered = render(content, { reactStrictMode });

							text.formatRange(6, 5, { font: "monospace" });
							rendered.rerender(content);

							const el = rendered.container.querySelector(".ql-font-monospace");
							assert.ok(el, "Expected .ql-font-monospace after formatRange");
							assert.match(el.textContent ?? "", /World/);
						});
					});
				});
			}
		});

		// Undo/Redo tests for non-transactional edits
		describe("undo/redo", () => {
			for (const reactStrictMode of [false, true]) {
				describe(`StrictMode: ${reactStrictMode}`, () => {
					it("insert character, undo removes it, redo restores it", () => {
						const { tree: text, treeView } = createFormattedTreeView();
						const editorRef = React.createRef<FormattedEditorHandle>();
						const content = (
							<FormattedMainView
								ref={editorRef}
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Insert a character
						text.insertAt(0, "A");
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /A/);

						// Undo - character should be removed
						editorRef.current?.undo();
						rendered.rerender(content);
						assert.doesNotMatch(rendered.baseElement.textContent ?? "", /A/);

						// Redo - character should be restored
						editorRef.current?.redo();
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /A/);
					});

					it("insert character, make bold, undo removes bold but keeps character", () => {
						const { tree: text, treeView } = createFormattedTreeView();
						const editorRef = React.createRef<FormattedEditorHandle>();
						const content = (
							<FormattedMainView
								ref={editorRef}
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						// Insert a character
						text.insertAt(0, "B");
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /B/);
						assert.ok(!rendered.container.querySelector("strong"), "Initially: no <strong>");

						// Make it bold
						text.formatRange(0, 1, { bold: true });
						rendered.rerender(content);
						assert.ok(
							rendered.container.querySelector("strong"),
							"After format: has <strong>",
						);

						// Undo - bold should be removed, character should remain
						editorRef.current?.undo();
						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /B/);
						assert.ok(
							!rendered.container.querySelector("strong"),
							"After undo: no <strong>, character remains",
						);
					});
				});
			}
		});

		// Unicode 16+ (joined emojis) section - test attribute cycling
		describe("Unicode 16+ joined emoji attribute cycling", () => {
			// ZWJ (Zero Width Joiner) emoji sequence: 👨‍👩‍👧‍👦 = family emoji
			const joinedEmoji = "👨‍👩‍👧‍👦";

			for (const reactStrictMode of [false, true]) {
				describe(`StrictMode: ${reactStrictMode}`, () => {
					it("applies bold to joined emoji and removes it preserving text", () => {
						const { tree: text, treeView } = createFormattedTreeView(
							`Test ${joinedEmoji} Text`,
						);
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						const emojiStart = 5; // "Test " is 5 chars
						const emojiLength = [...joinedEmoji].length;
						text.formatRange(emojiStart, emojiLength, { bold: true });
						rendered.rerender(content);

						assert.ok(
							rendered.container.querySelector("strong"),
							"After bold: expected <strong>",
						);
						assert.ok(
							(rendered.baseElement.textContent ?? "").includes(joinedEmoji),
							"After bold: emoji should be preserved",
						);

						text.formatRange(emojiStart, emojiLength, { bold: false });
						rendered.rerender(content);

						assert.ok(
							!rendered.container.querySelector("strong"),
							"After remove bold: no <strong> expected",
						);
						assert.ok(
							(rendered.baseElement.textContent ?? "").includes(joinedEmoji),
							"After remove bold: emoji should still be preserved",
						);
					});

					it("applies size to joined emoji and removes it preserving text", () => {
						const { tree: text, treeView } = createFormattedTreeView(
							`Test ${joinedEmoji} Text`,
						);
						const content = (
							<FormattedMainView
								root={toPropTreeNode(text)}
								treeViewEvents={treeView.events}
							/>
						);
						const rendered = render(content, { reactStrictMode });

						const emojiStart = 5;
						const emojiLength = [...joinedEmoji].length;
						text.formatRange(emojiStart, emojiLength, { size: 24 });
						rendered.rerender(content);

						assert.ok(
							rendered.container.querySelector(".ql-size-huge"),
							"After size: expected .ql-size-huge",
						);
						assert.ok(
							(rendered.baseElement.textContent ?? "").includes(joinedEmoji),
							"Emoji preserved",
						);

						text.formatRange(emojiStart, emojiLength, { size: 12 });
						rendered.rerender(content);

						assert.ok(
							!rendered.container.querySelector(".ql-size-huge"),
							"After remove: no .ql-size-huge",
						);
						assert.ok(
							(rendered.baseElement.textContent ?? "").includes(joinedEmoji),
							"Emoji still preserved",
						);
					});
				});
			}
		});
	});
});
