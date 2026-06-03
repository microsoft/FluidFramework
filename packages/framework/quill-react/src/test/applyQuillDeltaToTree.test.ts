/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TreeViewConfiguration } from "@fluidframework/tree";
import { FormattedTextAsTree, independentView } from "@fluidframework/tree/internal";
import DeltaPackage from "quill-delta";

import {
	applyQuillDeltaToTree,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../formatted/quillFormattedView.js";

const Delta = DeltaPackage.default;
type Delta = DeltaPackage.default;

/**
 * Build a fresh, independent (unhydrated) `FormattedTextAsTree.Tree` initialized from `initial`.
 * Independent views give us an isolated tree per test without pulling in container/runtime fixtures.
 */
function makeTree(initial: string = ""): FormattedTextAsTree.Tree {
	const view = independentView(
		new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree }),
		{},
	);
	view.initialize(FormattedTextAsTree.Tree.fromString(initial));
	return view.root;
}

/**
 * Build a tree containing a single `StringLineAtom` with the given line tag,
 * mirroring what `Quill` would emit when the user applies a header/list to an empty document.
 */
function lineAtomTree(tag: "h1" | "h2" | "h3" | "h4" | "h5"): FormattedTextAsTree.Tree {
	const tree = makeTree("");
	applyQuillDeltaToTree(tree, new Delta().insert("\n", { header: Number(tag.slice(1)) }));
	return tree;
}

describe("applyQuillDeltaToTree", () => {
	it("inserts plain text into an empty tree", () => {
		const tree = makeTree("");
		applyQuillDeltaToTree(tree, new Delta().insert("hello"));
		assert.equal(tree.fullString(), "hello");
	});

	it("inserts text with bold formatting", () => {
		const tree = makeTree("");
		applyQuillDeltaToTree(tree, new Delta().insert("bold!", { bold: true }));
		assert.equal(tree.fullString(), "bold!");
		const atoms = tree.charactersWithFormatting();
		assert.equal(atoms[0]?.format.bold, true);
		assert.equal(atoms[4]?.format.bold, true);
	});

	it("inserts after retaining existing content", () => {
		const tree = makeTree("hello");
		applyQuillDeltaToTree(tree, new Delta().retain(5).insert(" world"));
		assert.equal(tree.fullString(), "hello world");
	});

	it("deletes a range from the middle", () => {
		const tree = makeTree("hello world");
		applyQuillDeltaToTree(tree, new Delta().retain(5).delete(6));
		assert.equal(tree.fullString(), "hello");
	});

	it("inserts and deletes in the same delta (replace)", () => {
		const tree = makeTree("hello world");
		applyQuillDeltaToTree(tree, new Delta().retain(6).delete(5).insert("there"));
		assert.equal(tree.fullString(), "hello there");
	});

	it("applies bold formatting to retained text (case 5: char formatting)", () => {
		const tree = makeTree("hello");
		applyQuillDeltaToTree(tree, new Delta().retain(5, { bold: true }));
		const atoms = tree.charactersWithFormatting();
		for (let i = 0; i < 5; i++) {
			assert.equal(atoms[i]?.format.bold, true, `index ${i} should be bold`);
		}
	});

	it("handles UTF-16 / code-point conversions for emoji inserts", () => {
		const tree = makeTree("a😀b");
		assert.equal(tree.fullString(), "a😀b");
		assert.equal(tree.characterCount(), 3);
		// Insert "X" right after 😀 (UTF-16 index 3 in Quill's view)
		applyQuillDeltaToTree(tree, new Delta().retain(3).insert("X"));
		assert.equal(tree.fullString(), "a😀Xb");
	});

	it("handles UTF-16 / code-point conversions for emoji deletes", () => {
		const tree = makeTree("a😀b");
		// Delete the emoji (2 UTF-16 units starting at index 1)
		applyQuillDeltaToTree(tree, new Delta().retain(1).delete(2));
		assert.equal(tree.fullString(), "ab");
	});

	it("inserts a line atom for newline + line tag (case for header insert)", () => {
		const tree = makeTree("");
		applyQuillDeltaToTree(tree, new Delta().insert("\n", { header: 1 }));
		assert.equal(tree.fullString(), "\n");
		const atom = tree.charactersWithFormatting()[0]?.content;
		assert(atom instanceof FormattedTextAsTree.StringLineAtom);
		assert.equal(atom.tag.value, "h1");
	});

	it("converts an existing newline to a StringLineAtom (case 1: line formatting on newline)", () => {
		const tree = makeTree("hello\n");
		// Quill: "retain 5 chars, then retain the \n with header attribute"
		applyQuillDeltaToTree(tree, new Delta().retain(5).retain(1, { header: 2 }));
		assert.equal(tree.fullString(), "hello\n");
		const atom = tree.charactersWithFormatting()[5]?.content;
		assert(atom instanceof FormattedTextAsTree.StringLineAtom);
		assert.equal(atom.tag.value, "h2");
	});

	it("inserts a new line atom past the end (case 2: implicit trailing newline)", () => {
		const tree = makeTree("hello");
		// Quill emits this when you apply a header/list to the implicit trailing line.
		applyQuillDeltaToTree(tree, new Delta().retain(5).retain(1, { header: 3 }));
		assert.equal(tree.fullString(), "hello\n");
		const atom = tree.charactersWithFormatting()[5]?.content;
		assert(atom instanceof FormattedTextAsTree.StringLineAtom);
		assert.equal(atom.tag.value, "h3");
	});

	it("clears line formatting (case 4: line atom -> plain newline)", () => {
		const tree = lineAtomTree("h1");
		// Quill emits header: null when clearing line formatting.
		// eslint-disable-next-line unicorn/no-null
		applyQuillDeltaToTree(tree, new Delta().retain(1, { header: null }));
		const atom = tree.charactersWithFormatting()[0]?.content;
		assert(atom instanceof FormattedTextAsTree.StringTextAtom);
		assert.equal(tree.fullString(), "\n");
	});

	it("updates indent on an existing line atom (case 3: indent-only)", () => {
		const tree = lineAtomTree("h1");
		applyQuillDeltaToTree(tree, new Delta().retain(1, { indent: 2 }));
		const atom = tree.charactersWithFormatting()[0]?.content;
		assert(atom instanceof FormattedTextAsTree.StringLineAtom);
		assert.equal(atom.indent, 2);
	});

	it("is a no-op when delta has no ops", () => {
		const tree = makeTree("hello");
		applyQuillDeltaToTree(tree, new Delta());
		assert.equal(tree.fullString(), "hello");
	});
});
