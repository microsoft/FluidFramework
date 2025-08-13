/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";

import { defaultConsoleLogger } from "../../Logging.js";
import {
	transformTsdocSection,
	type TsdocNodeTransformOptions,
} from "../TsdocNodeTransforms.js";

const mockApiItem = {} as unknown as ApiItem;
const transformOptions: TsdocNodeTransformOptions = {
	logger: defaultConsoleLogger,
	contextApiItem: mockApiItem,
	resolveApiReference: (codeDestination) => ({
		type: "link",
		url: "<URL>",
		children: [
			{
				type: "text",
				value: codeDestination.emitAsTsdoc(),
			},
		],
	}),
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
				{
					type: "paragraph",
					children: [{ type: "text", value: "This is a simple comment." }],
				},
			]);
		});

		it("Escaped text", () => {
			// `@` is escaped to make TSDoc treat it as normal text, rather than as the start of a tag.
			const context = parser.parseString("/** \\@foo */");
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([
				{
					type: "paragraph",
					children: [
						{
							type: "text",
							value: "@foo",
						},
					],
				},
			]);
		});

		it("@example with fenced code", () => {
			const comment = `/**
 * \`\`\`typescript
 * const foo = "bar";
 * \`\`\`
 */`;

			const context = parser.parseString(comment);
			const summarySection = context.docComment.summarySection;

			const result = transformTsdocSection(summarySection, transformOptions);

			expect(result).to.deep.equal([
				{
					type: "code",
					value: 'const foo = "bar";',
					lang: "typescript",
				},
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
				{
					type: "paragraph",
					children: [
						{
							type: "text",
							value: "This is a simple comment. It has multiple paragraphs.",
						},
					],
				},
				{
					type: "paragraph",
					children: [
						{
							type: "text",
							value: "This is the second paragraph.",
						},
					],
				},
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
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 1" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [
												{
													type: "link",
													url: "<URL>",
													children: [
														{
															type: "text",
															value: "Item 2",
														},
													],
												},
											],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 3" }],
										},
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 1" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 2" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 3" }],
										},
									],
								},
							],
						},
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 4" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 5" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 6" }],
										},
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 1" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 2" }],
										},
									],
								},
							],
						},
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 3" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 4" }],
										},
									],
								},
							],
						},
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 5" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 6" }],
										},
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: true,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1.a" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1.b" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 2" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 2.a" }] },
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 1" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [
												{
													type: "link",
													url: "<URL>",
													children: [
														{
															type: "text",
															value: "Item 2",
														},
													],
												},
											],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 3" }],
										},
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 1" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 2" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 3" }],
										},
									],
								},
							],
						},
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 4" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 5" }],
										},
									],
								},
								{
									type: "listItem",
									children: [
										{
											type: "paragraph",
											children: [{ type: "text", value: "Item 6" }],
										},
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 2" }] },
									],
								},
							],
						},
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 3" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 4" }] },
									],
								},
							],
						},
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 5" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 6" }] },
									],
								},
							],
						},
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
						{
							type: "list",
							ordered: false,
							spread: false,
							children: [
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1.a" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 1.b" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 2" }] },
									],
								},
								{
									type: "listItem",
									children: [
										{ type: "paragraph", children: [{ type: "text", value: "Item 2.a" }] },
									],
								},
							],
						},
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
					{
						type: "list",
						ordered: true,
						spread: false,
						children: [
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 1" }] },
								],
							},
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 2" }] },
								],
							},
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 3" }] },
								],
							},
						],
					},
					{
						type: "list",
						ordered: false,
						spread: false,
						children: [
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 4" }] },
								],
							},
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 5" }] },
								],
							},
						],
					},
					{
						type: "list",
						ordered: false,
						spread: false,
						children: [
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 6" }] },
								],
							},
						],
					},
					{
						type: "list",
						ordered: true,
						spread: false,
						children: [
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 7" }] },
								],
							},
						],
					},
					{
						type: "list",
						ordered: true,
						spread: false,
						children: [
							{
								type: "listItem",
								children: [
									{ type: "paragraph", children: [{ type: "text", value: "Item 8" }] },
								],
							},
						],
					},
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
				{
					type: "list",
					ordered: false,
					spread: false,
					children: [
						{
							type: "listItem",
							children: [
								{
									type: "paragraph",
									children: [
										{
											type: "text",
											value:
												"This is a list item that is long enough to require soft wrapping. It spans multiple lines, but should still be parsed as a single list item.",
										},
									],
								},
							],
						},
						{
							type: "listItem",
							children: [
								{
									type: "paragraph",
									children: [
										{
											type: "text",
											value:
												"This is a second list item, which should end up in the same list as the previous one.",
										},
									],
								},
							],
						},
					],
				},
			]);
		});
	});

	// Test TODOs:
	// - Nested lists
	// - Interspersed paragraphs and lists
	// - Code blocks
});
