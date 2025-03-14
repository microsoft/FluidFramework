/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Anthropic } from "@anthropic-ai/sdk";
// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactoryAlpha,
	SharedTree,
	TreeViewConfiguration,
	asTreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { clod } from "../../../explicit-strategy/index.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.fhl.textai");

export class Word extends sf.object("Word", {
	characters: sf.string,
	createdDate: sf.optional(sf.string, {
		metadata: { llmDefault: () => new Date().toISOString() },
	}),
}) {}

export class Span extends sf.object("Span", {
	identifier: sf.identifier,
	words: sf.array(Word),
	bold: sf.required(sf.boolean),
	italic: sf.required(sf.boolean),
	comments: sf.required(sf.array(sf.string), {
		metadata: {
			description:
				"The IDs of all comments that are associated with this decoration. The list of comments and their IDs is under the Page object.",
		},
	}),
}) {}

// Not "Date" because that's a JS built-in
export class D8 extends sf.object("D8", {
	identifier: sf.identifier,
	year: sf.number,
	month: sf.number,
	day: sf.number,
}) {}

export class Paragraph extends sf.object("Paragraph", {
	identifier: sf.identifier,
	content: sf.array([Word, Span, D8]),
}) {}

export class Comment extends sf.object("Comment", {
	identifier: sf.required(sf.string, {
		metadata: {
			description: `A unique ID that allows this comment to be referenced in the "comments" field of a Decoration.`,
		},
	}),
	text: sf.string,
}) {}

export class Comments extends sf.array("Comments", Comment) {}

export class Page extends sf.object(
	"Page",
	{
		paragraphs: sf.array(Paragraph),
		comments: Comments,
	},
	{
		metadata: {
			description:
				"A page of text. It may contain multiple paragraphs. Arbitrary spans of words can be bolded or italicized if desired.",
		},
	},
) {}

const factory = SharedTree.getFactory();

describe.skip("Agent Editing Integration", () => {
	it("Duck Test", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(
			new TreeViewConfiguration({ schema: Page, preventAmbiguity: false }),
		);
		const today = new Date();
		const createdDate = today.toISOString();
		view.initialize({
			paragraphs: [
				new Paragraph({
					content: [
						new Span({
							words: [new Word({ characters: "This", createdDate })],
							bold: false,
							italic: true,
							comments: [],
						}),
						new Word({ characters: "is", createdDate }),
						new Word({ characters: "a", createdDate }),
						new Span({
							words: [new Word({ characters: "sample", createdDate })],
							bold: true,
							italic: false,
							comments: [],
						}),
						new Span({
							words: [
								new Word({ characters: "paragraph", createdDate }),
								new Word({ characters: ".", createdDate }),
							],
							bold: false,
							italic: false,
							comments: ["6663f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
						}),
						new Span({
							words: [
								new Word({ characters: "It", createdDate }),
								new Word({ characters: "was", createdDate }),
								new Word({ characters: "written", createdDate }),
								new Word({ characters: "on", createdDate }),
							],
							bold: false,
							italic: false,
							comments: [],
						}),
						new D8({
							year: today.getFullYear(),
							month: today.getMonth() + 1,
							day: today.getDate(),
						}),
						new Word({ characters: ".", createdDate }),
						new Word({ characters: "Use", createdDate }),
						new Word({ characters: "the", createdDate }),
						new Word({ characters: "chat", createdDate }),
						new Word({ characters: "box", createdDate }),
						new Word({ characters: "below", createdDate }),
						new Word({ characters: "to", createdDate }),
						new Word({ characters: "make", createdDate }),
						new Word({ characters: "edits", createdDate }),
						new Word({ characters: ".", createdDate }),
					],
				}),
			],
			comments: [
				{
					identifier: "6663f83b-c7b6-4f5e-9a9d-8f1e4f451b9a",
					text: "Should this be bold?",
				},
			],
		});

		const claudeClient = new Anthropic({
			apiKey: "TODO",
		});
		await clod({
			treeView: asTreeViewAlpha(view),
			clientOptions: { client: claudeClient /* options: { model: TEST_MODEL_NAME } */ },
			treeNode: view.root,
			prompt: {
				userAsk:
					"Please replace the sample paragraph with an amusing short story about ducks going to a buffet.",
				systemRoleContext: "",
			},
			onEdits: (state) => {
				debugger;
				return true;
			},
		});

		const stringified = toString(view.root);
		console.log(stringified);

		await clod({
			treeView: asTreeViewAlpha(view),
			clientOptions: { client: claudeClient /* options: { model: TEST_MODEL_NAME } */ },
			treeNode: view.root,
			prompt: {
				userAsk:
					"Please make all text unbolded and not italic, but then make all the food-related words bold.",
				systemRoleContext: "",
			},
			onEdits: (state) => {
				debugger;
				return true;
			},
		});

		const stringified2 = toString(view.root);
		console.log(stringified2);
	});

	function toString(page: Page): string {
		return page.paragraphs
			.map((p) => {
				return p.content
					.map((c) => {
						if (c instanceof Word) {
							return c.characters;
						} else if (c instanceof Span) {
							const text = c.words.map((w) => w.characters).join(" ");
							if (c.bold) {
								return `**${text}**`;
							}
							if (c.italic) {
								return `_${text}_`;
							}
							return `${text}`;
						} else if (c instanceof D8) {
							return `${c.month}/${c.day}/${c.year}`;
						}
					})
					.join(" ");
			})
			.join("\n");
	}

	// it("zod playground", () => {
	// 	let bar1 = false;
	// 	let bar2 = false;
	// 	let baz1 = false;
	// 	let baz2 = false;
	// 	z.object({
	// 		foo: z.union([
	// 			z
	// 				.object({
	// 					bar: z.number().transform((val) => {
	// 						bar1 = true;
	// 						return val;
	// 					}),
	// 				})
	// 				.transform((val) => {
	// 					bar2 = true;
	// 					return val;
	// 				}),
	// 			z
	// 				.object({
	// 					baz: z.number().transform((val) => {
	// 						baz1 = true;
	// 						return val;
	// 					}),
	// 				})
	// 				.transform((val) => {
	// 					baz2 = true;
	// 					return val;
	// 				}),
	// 		]),
	// 	}).safeParse({
	// 		foo: {
	// 			bar: 42,
	// 		},
	// 	});

	// 	assert.equal(bar1, true);
	// 	assert.equal(bar2, true);
	// 	assert.equal(baz1, false);
	// 	assert.equal(baz2, false);
	// });
});
