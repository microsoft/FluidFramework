/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	HeadingNode,
	HorizontalRuleNode,
	ParagraphNode,
	SectionNode,
} from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("HierarchicalSection Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Simple section", () => {
			const input = new SectionNode(
				[
					ParagraphNode.createFromPlainText("Foo"),
					HorizontalRuleNode.Singleton,
					ParagraphNode.createFromPlainText("Bar"),
				],
				/* heading: */ HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id"),
			);

			const result = testRender(input);

			const expected = [
				"",
				"# Hello World {#heading-id}",
				"",
				"Foo",
				"",
				"---",
				"",
				"Bar",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});

		it("Nested section", () => {
			const input = new SectionNode(
				[
					new SectionNode(
						[ParagraphNode.createFromPlainText("Foo")],
						/* heading: */ HeadingNode.createFromPlainText(
							"Sub-Heading 1",
							/* id: */ "sub-heading-1",
						),
					),

					new SectionNode(
						[
							new SectionNode(
								[ParagraphNode.createFromPlainText("Bar")],
								/* heading: */ HeadingNode.createFromPlainText("Sub-Heading 2b"),
							),
						],
						/* heading: */ HeadingNode.createFromPlainText("Sub-Heading 2"),
					),
				],
				/* heading: */ HeadingNode.createFromPlainText(
					"Root Heading",
					/* id: */ "root-heading",
				),
			);

			const result = testRender(input);

			const expected = [
				"",
				"# Root Heading {#root-heading}",
				"",
				"## Sub-Heading 1 {#sub-heading-1}",
				"",
				"Foo",
				"",
				"## Sub-Heading 2",
				"",
				"### Sub-Heading 2b",
				"",
				"Bar",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Simple section", () => {
			const input = new SectionNode(
				[
					ParagraphNode.createFromPlainText("Foo"),
					HorizontalRuleNode.Singleton,
					ParagraphNode.createFromPlainText("Bar"),
				],
				/* heading: */ HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id"),
			);

			const result = testRender(input, { insideTable: true });

			const expected = [
				"<section>",
				'<h1 id="heading-id">',
				"Hello World",
				"</h1>",
				"<p>",
				"Foo",
				"</p>",
				"<hr>",
				"<p>",
				"Bar",
				"</p>",
				"</section>",
			].join("");

			expect(result).to.equal(expected);
		});

		it("Nested section", () => {
			const input = new SectionNode(
				[
					new SectionNode(
						[ParagraphNode.createFromPlainText("Foo")],
						/* heading: */ HeadingNode.createFromPlainText(
							"Sub-Heading 1",
							/* id: */ "sub-heading-1",
						),
					),

					new SectionNode(
						[
							new SectionNode(
								[ParagraphNode.createFromPlainText("Bar")],
								/* heading: */ HeadingNode.createFromPlainText("Sub-Heading 2b"),
							),
						],
						/* heading: */ HeadingNode.createFromPlainText("Sub-Heading 2"),
					),
				],
				/* heading: */ HeadingNode.createFromPlainText(
					"Root Heading",
					/* id: */ "root-heading",
				),
			);

			const result = testRender(input, { insideTable: true });

			const expected = [
				"<section>",
				'<h1 id="root-heading">',
				"Root Heading",
				"</h1>",
				"<section>",
				'<h2 id="sub-heading-1">',
				"Sub-Heading 1",
				"</h2>",
				"<p>",
				"Foo",
				"</p>",
				"</section>",
				"<section>",
				"<h2>",
				"Sub-Heading 2",
				"</h2>",
				"<section>",
				"<h3>",
				"Sub-Heading 2b",
				"</h3>",
				"<p>",
				"Bar",
				"</p>",
				"</section>",
				"</section>",
				"</section>",
			].join("");

			expect(result).to.equal(expected);
		});
	});
});
