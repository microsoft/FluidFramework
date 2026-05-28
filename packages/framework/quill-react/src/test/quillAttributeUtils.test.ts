/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TreeViewConfiguration } from "@fluidframework/tree";
import { independentView, FormattedTextAsTree } from "@fluidframework/tree/internal";
import globalJsdom from "global-jsdom";
import DeltaPackage from "quill-delta";

import {
	clipboardFormatMatcher,
	defaultFont,
	defaultSize,
	formatToFullQuillAttributes,
	formatToQuillAttributes,
	parseCssFontFamily,
	parseCssFontSize,
	parseLineTag,
	parseSize,
	quillAttributesToFormat,
	quillAttributesToPartial,
	sizeToQuillAttribute,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../formatted/quillAttributeUtils.js";

const Delta = DeltaPackage.default;

/**
 * Build a fresh, hydrated CharacterFormat with the given properties.
 * @remarks
 * Uses an independent view so we don't need container/runtime fixtures.
 */
function makeFormat(
	props: Partial<{
		bold: boolean;
		italic: boolean;
		underline: boolean;
		size: number;
		font: string;
	}> = {},
): FormattedTextAsTree.CharacterFormat {
	const tree = independentView(
		new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree }),
		{},
	);
	tree.initialize(FormattedTextAsTree.Tree.fromString(""));
	return new FormattedTextAsTree.CharacterFormat({
		bold: props.bold ?? false,
		italic: props.italic ?? false,
		underline: props.underline ?? false,
		size: props.size ?? defaultSize,
		font: props.font ?? defaultFont,
	});
}

/**
 * Build a real HTMLElement with the given inline styles for parseCss* tests.
 * @remarks
 * Uses jsdom (which the test runner provides) rather than a hand-rolled stub so
 * the real `style.fontSize`/`style.fontFamily` parsing path is exercised.
 */
function makeElement(style: { fontSize?: string; fontFamily?: string } = {}): HTMLElement {
	const node = document.createElement("span");
	if (style.fontSize !== undefined) node.style.fontSize = style.fontSize;
	if (style.fontFamily !== undefined) node.style.fontFamily = style.fontFamily;
	return node;
}

describe("quillAttributeUtils", () => {
	// JSDOM is set up once in mochaHooks.ts but torn down before tests run; reinitialize
	// here so `document` is available for the parseCss*/clipboardFormatMatcher cases.
	let cleanup: () => void;
	before(() => {
		cleanup = globalJsdom();
	});
	after(() => {
		cleanup();
	});

	describe("parseSize", () => {
		it("returns numeric size unchanged", () => {
			assert.equal(parseSize(14), 14);
			assert.equal(parseSize(0), 0);
		});

		it("maps Quill named sizes to pixel values", () => {
			assert.equal(parseSize("small"), 10);
			assert.equal(parseSize("large"), 18);
			assert.equal(parseSize("huge"), 24);
		});

		it("parses pixel-string sizes", () => {
			assert.equal(parseSize("16"), 16);
			assert.equal(parseSize("24px"), 24);
		});

		it("returns the default for unrecognized values", () => {
			assert.equal(parseSize(undefined), defaultSize);
			// eslint-disable-next-line unicorn/no-null
			assert.equal(parseSize(null), defaultSize);
			assert.equal(parseSize("notasize"), defaultSize);
			assert.equal(parseSize({}), defaultSize);
		});
	});

	describe("sizeToQuillAttribute", () => {
		it("returns the named size for sizes Quill recognizes", () => {
			assert.equal(sizeToQuillAttribute(10), "small");
			assert.equal(sizeToQuillAttribute(18), "large");
			assert.equal(sizeToQuillAttribute(24), "huge");
		});

		it("falls back to a px string for unrecognized sizes", () => {
			assert.equal(sizeToQuillAttribute(16), "16px");
			assert.equal(sizeToQuillAttribute(8), "8px");
		});
	});

	describe("parseLineTag", () => {
		it("returns undefined for missing or empty attributes", () => {
			assert.equal(parseLineTag(undefined), undefined);
			assert.equal(parseLineTag({}), undefined);
		});

		it("maps Quill header levels to LineTag values", () => {
			assert.deepEqual(parseLineTag({ header: 1 }), FormattedTextAsTree.LineTag("h1"));
			assert.deepEqual(parseLineTag({ header: 5 }), FormattedTextAsTree.LineTag("h5"));
		});

		it("falls back to h5 for unsupported header levels", () => {
			assert.deepEqual(parseLineTag({ header: 99 }), FormattedTextAsTree.LineTag("h5"));
		});

		it("maps Quill list types to LineTag values", () => {
			assert.deepEqual(parseLineTag({ list: "bullet" }), FormattedTextAsTree.LineTag("li"));
			assert.deepEqual(parseLineTag({ list: "ordered" }), FormattedTextAsTree.LineTag("ol"));
			assert.deepEqual(
				parseLineTag({ list: "checked" }),
				FormattedTextAsTree.LineTag("checked"),
			);
			assert.deepEqual(
				parseLineTag({ list: "unchecked" }),
				FormattedTextAsTree.LineTag("unchecked"),
			);
		});

		it("returns undefined for unrecognized list values", () => {
			assert.equal(parseLineTag({ list: "weird" }), undefined);
		});

		it("maps blockquote and code-block", () => {
			assert.deepEqual(
				parseLineTag({ blockquote: true }),
				FormattedTextAsTree.LineTag("blockquote"),
			);
			assert.deepEqual(
				parseLineTag({ "code-block": "plain" }),
				FormattedTextAsTree.LineTag("codeBlock"),
			);
		});

		it("ignores blockquote: false (Quill sends false to clear)", () => {
			assert.equal(parseLineTag({ blockquote: false }), undefined);
		});
	});

	describe("quillAttributesToFormat", () => {
		it("returns defaults when no attributes provided", () => {
			const result = quillAttributesToFormat();
			assert.deepEqual(result, {
				bold: false,
				italic: false,
				underline: false,
				size: defaultSize,
				font: defaultFont,
			});
		});

		it("only sets bold/italic/underline when explicitly true", () => {
			const result = quillAttributesToFormat({ bold: true, italic: false });
			assert.equal(result.bold, true);
			assert.equal(result.italic, false);
			assert.equal(result.underline, false);
		});

		it("converts size and font", () => {
			const result = quillAttributesToFormat({ size: "huge", font: "monospace" });
			assert.equal(result.size, 24);
			assert.equal(result.font, "monospace");
		});

		it("ignores non-string font values", () => {
			const result = quillAttributesToFormat({ font: 42 });
			assert.equal(result.font, defaultFont);
		});
	});

	describe("quillAttributesToPartial", () => {
		it("returns an empty object when no attributes provided", () => {
			assert.deepEqual(quillAttributesToPartial(), {});
		});

		it("only includes properties that are explicitly present", () => {
			// Keys with `undefined` value are still considered "in"; this matches Quill's
			// behavior of sending explicit `undefined` to clear formatting.
			const result = quillAttributesToPartial({ bold: true, font: "serif" });
			assert.deepEqual(result, { bold: true, font: "serif" });
		});

		it("treats falsy bold/italic/underline values as false", () => {
			// Quill represents "remove this attribute" with various falsy values.
			const result = quillAttributesToPartial({ bold: false, italic: undefined });
			assert.equal(result.bold, false);
			assert.equal(result.italic, false);
		});

		it("normalizes size strings to numbers", () => {
			assert.equal(quillAttributesToPartial({ size: "small" }).size, 10);
			assert.equal(quillAttributesToPartial({ size: "16" }).size, 16);
		});
	});

	describe("formatToQuillAttributes", () => {
		it("omits default values to keep the delta minimal", () => {
			const format = makeFormat({});
			assert.deepEqual(formatToQuillAttributes(format), {});
		});

		it("includes only non-default formatting flags", () => {
			const format = makeFormat({ bold: true, italic: true });
			assert.deepEqual(formatToQuillAttributes(format), { bold: true, italic: true });
		});

		it("emits a named size when the size matches a Quill name", () => {
			const format = makeFormat({ size: 18 });
			assert.deepEqual(formatToQuillAttributes(format), { size: "large" });
		});

		it("emits a px string for non-default, unnamed sizes", () => {
			const format = makeFormat({ size: 16 });
			assert.deepEqual(formatToQuillAttributes(format), { size: "16px" });
		});

		it("emits the font when not the default", () => {
			const format = makeFormat({ font: "serif" });
			assert.deepEqual(formatToQuillAttributes(format), { font: "serif" });
		});
	});

	describe("formatToFullQuillAttributes", () => {
		it("emits null for default-valued properties (so Quill clears them)", () => {
			const format = makeFormat({});
			// eslint-disable-next-line unicorn/no-null
			assert.deepEqual(formatToFullQuillAttributes(format), {
				// eslint-disable-next-line unicorn/no-null
				bold: null,
				// eslint-disable-next-line unicorn/no-null
				italic: null,
				// eslint-disable-next-line unicorn/no-null
				underline: null,
				// eslint-disable-next-line unicorn/no-null
				size: null,
				// eslint-disable-next-line unicorn/no-null
				font: null,
			});
		});

		it("emits true for set boolean flags and the value otherwise", () => {
			const format = makeFormat({ bold: true, size: 18, font: "monospace" });
			assert.deepEqual(formatToFullQuillAttributes(format), {
				bold: true,
				// eslint-disable-next-line unicorn/no-null
				italic: null,
				// eslint-disable-next-line unicorn/no-null
				underline: null,
				size: "large",
				font: "monospace",
			});
		});
	});

	describe("parseCssFontSize", () => {
		it("returns a Quill named size for a recognized px value", () => {
			assert.equal(parseCssFontSize(makeElement({ fontSize: "10px" })), "small");
			assert.equal(parseCssFontSize(makeElement({ fontSize: "18px" })), "large");
			assert.equal(parseCssFontSize(makeElement({ fontSize: "24px" })), "huge");
		});

		it("rounds px values to the nearest integer before lookup", () => {
			assert.equal(parseCssFontSize(makeElement({ fontSize: "17.6px" })), "large");
		});

		it("returns undefined for unrecognized px values (including the default)", () => {
			assert.equal(parseCssFontSize(makeElement({ fontSize: "12px" })), undefined);
			assert.equal(parseCssFontSize(makeElement({ fontSize: "16px" })), undefined);
		});

		it("returns undefined for non-px units or missing fontSize", () => {
			assert.equal(parseCssFontSize(makeElement({ fontSize: "1em" })), undefined);
			assert.equal(parseCssFontSize(makeElement({})), undefined);
		});
	});

	describe("parseCssFontFamily", () => {
		it("returns the first recognized font from the priority list", () => {
			assert.equal(
				parseCssFontFamily(makeElement({ fontFamily: "monospace, serif" })),
				"monospace",
			);
			assert.equal(parseCssFontFamily(makeElement({ fontFamily: "Arial" })), "Arial");
		});

		it("strips quotes around quoted font names", () => {
			assert.equal(
				parseCssFontFamily(makeElement({ fontFamily: '"monospace", serif' })),
				"monospace",
			);
			assert.equal(
				parseCssFontFamily(makeElement({ fontFamily: "'serif', sans-serif" })),
				"serif",
			);
		});

		it("returns undefined for unsupported font families", () => {
			assert.equal(parseCssFontFamily(makeElement({ fontFamily: "Comic Sans" })), undefined);
			assert.equal(parseCssFontFamily(makeElement({})), undefined);
		});
	});

	describe("clipboardFormatMatcher", () => {
		it("returns the input delta unchanged when node is not an HTMLElement", () => {
			const delta = new Delta().insert("hello");
			const text = document.createTextNode("hello");
			assert.equal(clipboardFormatMatcher(text, delta), delta);
		});

		it("returns the input delta unchanged when no recognized styles are present", () => {
			const delta = new Delta().insert("hello");
			const node = makeElement({});
			const result = clipboardFormatMatcher(node, delta);
			assert.deepEqual(result.ops, delta.ops);
		});

		it("preserves recognized font-size by composing a retain with the size attribute", () => {
			const delta = new Delta().insert("hello");
			const node = makeElement({ fontSize: "18px" });
			const result = clipboardFormatMatcher(node, delta);
			assert.deepEqual(result.ops, [{ insert: "hello", attributes: { size: "large" } }]);
		});

		it("preserves recognized font-family by composing a retain with the font attribute", () => {
			const delta = new Delta().insert("hello");
			const node = makeElement({ fontFamily: "monospace" });
			const result = clipboardFormatMatcher(node, delta);
			assert.deepEqual(result.ops, [{ insert: "hello", attributes: { font: "monospace" } }]);
		});

		it("preserves both size and font when both are present", () => {
			const delta = new Delta().insert("hello");
			const node = makeElement({ fontSize: "10px", fontFamily: "serif" });
			const result = clipboardFormatMatcher(node, delta);
			assert.deepEqual(result.ops, [
				{ insert: "hello", attributes: { size: "small", font: "serif" } },
			]);
		});
	});
});
