/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import type { VerboseTree } from "@fluidframework/tree/alpha";

import { Page, Paragraph, Sentence, Word, Span, stringifyPage } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

const expected: ScorableVerboseTree = {
	"type": "com.microsoft.fluid.tree-agent.text.Page",
	"fields": {
		"paragraphs": {
			"type":
				'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Paragraph"]>',
			"fields": [
				{
					"type": "com.microsoft.fluid.tree-agent.text.Paragraph",
					"fields": {
						"sentences": {
							"type":
								'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Sentence"]>',
							"fields": [
								{
									"type": "com.microsoft.fluid.tree-agent.text.Sentence",
									"fields": {
										"words": {
											"type":
												'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Span","com.microsoft.fluid.tree-agent.text.Word"]>',
											"fields": [
												{
													"type": "com.microsoft.fluid.tree-agent.text.Word",
													"fields": {
														"characters": "Bagels",
													},
												},
												{
													"type": "com.microsoft.fluid.tree-agent.text.Word",
													"fields": {
														"characters": "are",
													},
												},
												{
													"type": "com.microsoft.fluid.tree-agent.text.Span",
													"fields": {
														"words": {
															"type":
																'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Word"]>',
															"fields": [
																{
																	"type": "com.microsoft.fluid.tree-agent.text.Word",
																	"fields": {
																		"characters": "a",
																	},
																},
																{
																	"type": "com.microsoft.fluid.tree-agent.text.Word",
																	"fields": {
																		"characters": "real",
																	},
																},
															],
														},
														"bold": false,
														"italic": true,
														"comments": {
															"type":
																'com.microsoft.fluid.tree-agent.text.Array<["com.fluidframework.leaf.string"]>',
															"fields": ["6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
														},
													},
												},
												{
													"type": "com.microsoft.fluid.tree-agent.text.Span",
													"fields": {
														"words": {
															"type":
																'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Word"]>',
															"fields": [
																{
																	"type": "com.microsoft.fluid.tree-agent.text.Word",
																	"fields": {
																		"characters": "treat",
																	},
																},
															],
														},
														"bold": false,
														"italic": true,
														"comments": {
															"type":
																'com.microsoft.fluid.tree-agent.text.Array<["com.fluidframework.leaf.string"]>',
															[scoreSymbol]: (
																actual: VerboseTree<never>,
																actualTree: VerboseTree<never>,
															): number => {
																if (
																	typeof actual === "object" &&
																	actual !== null &&
																	Array.isArray(actual.fields) &&
																	typeof actualTree === "object" &&
																	actualTree !== null &&
																	!Array.isArray(actualTree.fields)
																) {
																	const comments = actualTree.fields.comments;
																	if (
																		typeof comments === "object" &&
																		comments !== null &&
																		Array.isArray(comments.fields) &&
																		comments.fields.some((c) => {
																			if (
																				typeof c === "object" &&
																				c !== null &&
																				!Array.isArray(c.fields) &&
																				typeof c.fields.identifier === "string"
																			) {
																				return c.fields.identifier === actual.fields[0];
																			}
																		})
																	) {
																		return actual.fields.length === 2 ? 1 : 0.8;
																	}
																}
																return 0;
															},
														},
													},
												},
											],
										},
									},
								},
							],
						},
					},
				},
			],
		},
		"comments": {
			"type":
				'com.microsoft.fluid.tree-agent.text.Array<["com.microsoft.fluid.tree-agent.text.Comment"]>',
			[scoreSymbol]: (actual: VerboseTree<never>): number => {
				if (
					typeof actual === "object" &&
					actual !== null &&
					Array.isArray(actual.fields) &&
					actual.fields.length === 2 &&
					actual.fields.some((c) => {
						if (typeof c === "object" && c !== null && !Array.isArray(c.fields)) {
							return c.fields.text === "Makes me think of Halloween :)";
						}
						return false;
					})
				) {
					return 1;
				}
				return 0;
			},
		},
	},
};

/**
 * TODO
 */
export const addCommentTest = {
	name: "Add a comment",
	schema: Page,
	initialTree: () => ({
		paragraphs: [
			new Paragraph({
				sentences: [
					new Sentence({
						words: [
							new Word({ characters: "Bagels" }),
							new Word({ characters: "are" }),
							new Span({
								words: [
									new Word({ characters: "a" }),
									new Word({ characters: "real" }),
									new Word({ characters: "treat" }),
								],
								bold: false,
								italic: true,
								comments: ["6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
							}),
						],
					}),
				],
			}),
		],
		comments: [
			{
				identifier: "6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a",
				text: "I love this expression!",
			},
		],
	}),
	prompt:
		"Please add a comment to the word 'treat' that says 'Makes me think of Halloween :)'",
	expected,
	options: {
		treeToString: stringifyPage,
		domainHints: `You are an assistant that helps people create and edit pages of text. When adding new text, each word (e.g. "the", "cat", "lemonade", etc.) should go in its own Word object. Do not add comments or style the text (i.e. do not use Spans) unless the user specifically asked you to. If the user asks you to style a particular word or phrase that is already included in a larger span, you may split the span into smaller spans in order to apply the style at the granularity requested. Likewise, if two or more adjacent spans have the exact same styling, merge them together.`,
	},
} as const satisfies LLMIntegrationTest<typeof Page>;
