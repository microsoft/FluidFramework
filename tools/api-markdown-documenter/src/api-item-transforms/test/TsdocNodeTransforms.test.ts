/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";

import { defaultConsoleLogger } from "../../Logging.js";
import {
	LinkNode,
	ListItemNode,
	ListNode,
	ParagraphNode,
	PlainTextNode,
} from "../../documentation-domain/index.js";
import {
	transformTsdocSection,
	type TsdocNodeTransformOptions,
} from "../TsdocNodeTransforms.js";

const mockApiItem = {} as unknown as ApiItem;
const transformOptions: TsdocNodeTransformOptions = {
	logger: defaultConsoleLogger,
	contextApiItem: mockApiItem,
	resolveApiReference: (codeDestination) =>
		new LinkNode(codeDestination.emitAsTsdoc(), "<URL>"),
};

describe("Tsdoc node transformation tests", () => {
	describe("transformTsdoc", () => {
		const parser = new TSDocParser();

		it("Empty comment", () => {
			const context = parser.parseString("/** */");
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([]);
		});

		it("Simple comment", () => {
			const context = parser.parseString("/** This is a simple comment. */");
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([
				new ParagraphNode([new PlainTextNode("This is a simple comment.")]),
			]);
		});

		it("Multi-paragraph comment", () => {
			const comment = `/**
 * This is a simple comment.
 * It has multiple paragraphs.
 *
 * This is the second paragraph.
 */`;
			const context = parser.parseString(comment);
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([
				new ParagraphNode([
					new PlainTextNode("This is a simple comment. It has multiple paragraphs."),
				]),
				new ParagraphNode([new PlainTextNode("This is the second paragraph.")]),
			]);
		});

		describe("Lists", () => {
			describe("Ordered lists", () => {
				it("Ordered list", () => {
					const comment = `/**
 * 1. Item 1
 * 2. {@link item2 | Item 2}
 * 3. Item 3
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new LinkNode("Item 2", "<URL>")]),
								new ListItemNode([new PlainTextNode("Item 3")]),
							],
							true,
						),
					]);
				});

				it("Lists in separate paragraphs", () => {
					// Despite the numbering implying a single list, the comment has a blank line between the first and second sets of list items,
					// so they should be parsed as separate lists.
					const comment = `/**
 * 1. Item 1
 * 2. Item 2
 * 3. Item 3
 *
 * 4. Item 4
 * 5. Item 5
 * 6. Item 6
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
								new ListItemNode([new PlainTextNode("Item 3")]),
							],
							true,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 4")]),
								new ListItemNode([new PlainTextNode("Item 5")]),
								new ListItemNode([new PlainTextNode("Item 6")]),
							],
							true,
						),
					]);
				});

				it("Adjacent lists with different delimiters", () => {
					const comment = `/**
 * 1. Item 1
 * 2. Item 2
 * 3) Item 3
 * 4) Item 4
 * 5. Item 5
 * 6. Item 6
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
							],
							true,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 3")]),
								new ListItemNode([new PlainTextNode("Item 4")]),
							],
							true,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 5")]),
								new ListItemNode([new PlainTextNode("Item 6")]),
							],
							true,
						),
					]);
				});

				// Note: we do not currently supported nested lists.
				// If we add support later, this test should be updated.
				it("Nested lists", () => {
					const comment = `/**
 * 1. Item 1
 *   1. Item 1.a
 *   2. Item 1.b
 * 2. Item 2
 * 	1. Item 2.a
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 1.a")]),
								new ListItemNode([new PlainTextNode("Item 1.b")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
								new ListItemNode([new PlainTextNode("Item 2.a")]),
							],
							true,
						),
					]);
				});
			});

			describe("Unordered lists", () => {
				it("Unordered list", () => {
					const comment = `/**
 * - Item 1
 * - {@link item2 | Item 2}
 * - Item 3
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new LinkNode("Item 2", "<URL>")]),
								new ListItemNode([new PlainTextNode("Item 3")]),
							],
							false,
						),
					]);
				});

				it("Lists in separate paragraphs", () => {
					const comment = `/**
 * - Item 1
 * - Item 2
 * - Item 3
 *
 * - Item 4
 * - Item 5
 * - Item 6
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
								new ListItemNode([new PlainTextNode("Item 3")]),
							],
							false,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 4")]),
								new ListItemNode([new PlainTextNode("Item 5")]),
								new ListItemNode([new PlainTextNode("Item 6")]),
							],
							false,
						),
					]);
				});

				it("Adjacent lists with different delimiters", () => {
					const comment = `/**
 * - Item 1
 * - Item 2
 * * Item 3
 * * Item 4
 * - Item 5
 * - Item 6
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
							],
							false,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 3")]),
								new ListItemNode([new PlainTextNode("Item 4")]),
							],
							false,
						),
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 5")]),
								new ListItemNode([new PlainTextNode("Item 6")]),
							],
							false,
						),
					]);
				});

				// Note: we do not currently supported nested lists.
				// If we add support later, this test should be updated.
				it("Nested lists", () => {
					const comment = `/**
 * - Item 1
 *   - Item 1.a
 *   - Item 1.b
 * - Item 2
 * 	- Item 2.a
 */`;
					const context = parser.parseString(comment);
					const summarySection = context.docComment.summarySection;

					const result = transformTsdocSection(summarySection, transformOptions);

					expect(result).to.deep.equal([
						new ListNode(
							[
								new ListItemNode([new PlainTextNode("Item 1")]),
								new ListItemNode([new PlainTextNode("Item 1.a")]),
								new ListItemNode([new PlainTextNode("Item 1.b")]),
								new ListItemNode([new PlainTextNode("Item 2")]),
								new ListItemNode([new PlainTextNode("Item 2.a")]),
							],
							false,
						),
					]);
				});
			});
		});

		describe("Mixed", () => {
			it("Mixed ordered and unordered lists", () => {
				const comment = `/**
* 1. Item 1
* 2. Item 2
* 3. Item 3
* - Item 4
* - Item 5
* * Item 6
* 7. Item 7
*
* 8. Item 8
*/`;
				const context = parser.parseString(comment);
				const summarySection = context.docComment.summarySection;

				const result = transformTsdocSection(summarySection, transformOptions);

				expect(result).to.deep.equal([
					new ListNode(
						[
							new ListItemNode([new PlainTextNode("Item 1")]),
							new ListItemNode([new PlainTextNode("Item 2")]),
							new ListItemNode([new PlainTextNode("Item 3")]),
						],
						true,
					),
					new ListNode(
						[
							new ListItemNode([new PlainTextNode("Item 4")]),
							new ListItemNode([new PlainTextNode("Item 5")]),
						],
						false,
					),
					new ListNode([new ListItemNode([new PlainTextNode("Item 6")])], false),
					new ListNode([new ListItemNode([new PlainTextNode("Item 7")])], true),
					new ListNode([new ListItemNode([new PlainTextNode("Item 8")])], true),
				]);
			});
		});

		it("List with soft wrapping", () => {
			const comment = `/**
 * - This is a list item that is long enough to require soft wrapping.
 * It spans multiple lines, but should still be parsed as a single list item.
 * - This is a second list item, which should end up in the same list as the previous one.
 */`;
			const context = parser.parseString(comment);
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([
				new ListNode(
					[
						new ListItemNode([
							new PlainTextNode(
								"This is a list item that is long enough to require soft wrapping. It spans multiple lines, but should still be parsed as a single list item.",
							),
						]),
						new ListItemNode([
							new PlainTextNode(
								"This is a second list item, which should end up in the same list as the previous one.",
							),
						]),
					],
					false,
				),
			]);
		});
	});

	// Test TODOs:
	// - Nested lists
	// - Interspersed paragraphs and lists
	// - Code blocks
});
