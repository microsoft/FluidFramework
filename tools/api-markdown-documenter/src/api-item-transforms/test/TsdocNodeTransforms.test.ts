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

				it("Multiple lists", () => {
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

				it("Multiple lists", () => {
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
			});

			it("Mixed lists", () => {
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

		// Test TODOs:
		// - Nested lists
		// - Interspersed paragraphs and lists
		// - Code blocks
	});
});
