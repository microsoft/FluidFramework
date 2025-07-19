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

		// Test TODOs:
		// - Multiple lists
		// - Nested lists
		// - Interspersed paragraphs and lists
		// - Code blocks
	});
});
