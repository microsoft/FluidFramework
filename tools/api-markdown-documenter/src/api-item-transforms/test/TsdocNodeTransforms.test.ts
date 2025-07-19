/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";

import { defaultConsoleLogger } from "../../Logging.js";
import { LinkNode, ParagraphNode, PlainTextNode } from "../../documentation-domain/index.js";
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

		// Test TODOs:
		// - Single list
		// - Multiple lists
		// - Nested lists
		// - Interspersed paragraphs and lists
		// - Code blocks
	});
});
