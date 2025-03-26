/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFileSync } from "node:fs";

import { Anthropic } from "@anthropic-ai/sdk";
// eslint-disable-next-line import/no-internal-modules
import { fail } from "@fluidframework/core-utils/internal";
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

import { SharedTreeSemanticAgent } from "../../agent.js";
import { llmDefault } from "../../utils.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.fhl.textai");

export class Word extends sf.object("Word", {
	characters: sf.string,
	createdDate: sf.optional(sf.string, {
		metadata: { custom: { [llmDefault]: () => new Date().toISOString() } },
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
				"The identifiers of all comments that are associated with this decoration. The list of comments and their IDs is under the Page object.",
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

describe("Agent Editing Integration 2", () => {
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
		// view.initialize({
		// 	paragraphs: [
		// 		new Paragraph({
		// 			content: [
		// 				new Span({
		// 					words: [new Word({ characters: "This", createdDate })],
		// 					bold: false,
		// 					italic: true,
		// 					comments: [],
		// 				}),
		// 				new Word({ characters: "is", createdDate }),
		// 				new Word({ characters: "a", createdDate }),
		// 				new Span({
		// 					words: [new Word({ characters: "sample", createdDate })],
		// 					bold: true,
		// 					italic: false,
		// 					comments: [],
		// 				}),
		// 				new Span({
		// 					words: [
		// 						new Word({ characters: "paragraph", createdDate }),
		// 						new Word({ characters: ".", createdDate }),
		// 					],
		// 					bold: false,
		// 					italic: false,
		// 					comments: ["6663f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
		// 				}),
		// 				new Span({
		// 					words: [
		// 						new Word({ characters: "It", createdDate }),
		// 						new Word({ characters: "was", createdDate }),
		// 						new Word({ characters: "written", createdDate }),
		// 						new Word({ characters: "on", createdDate }),
		// 					],
		// 					bold: false,
		// 					italic: false,
		// 					comments: [],
		// 				}),
		// 				new D8({
		// 					year: today.getFullYear(),
		// 					month: today.getMonth() + 1,
		// 					day: today.getDate(),
		// 				}),
		// 				new Word({ characters: ".", createdDate }),
		// 				new Word({ characters: "Use", createdDate }),
		// 				new Word({ characters: "the", createdDate }),
		// 				new Word({ characters: "chat", createdDate }),
		// 				new Word({ characters: "box", createdDate }),
		// 				new Word({ characters: "below", createdDate }),
		// 				new Word({ characters: "to", createdDate }),
		// 				new Word({ characters: "make", createdDate }),
		// 				new Word({ characters: "edits", createdDate }),
		// 				new Word({ characters: ".", createdDate }),
		// 			],
		// 		}),
		// 	],
		// 	comments: [
		// 		{
		// 			identifier: "6663f83b-c7b6-4f5e-9a9d-8f1e4f451b9a",
		// 			text: "Should this be bold?",
		// 		},
		// 	],
		// });

		view.initialize({
			paragraphs: [
				new Paragraph({
					content: [
						new Word({ characters: "Bagels", createdDate }),
						new Word({ characters: "are", createdDate }),
						new Span({
							words: [
								new Word({ characters: "a", createdDate }),
								new Word({ characters: "real", createdDate }),
								new Word({ characters: "treat", createdDate }),
							],
							bold: false,
							italic: true,
							comments: ["6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
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
		});

		const client = new Anthropic({
			apiKey: "TODO",
		});

		const agent = new SharedTreeSemanticAgent(client, asTreeViewAlpha(view), {
			hints: `You are an assistant that helps people create and edit pages of text. When adding new text, each word (e.g. "the", "cat", "lemonade", etc.) should go in its own Word object. Do not add comments or style the text (i.e. do not use Spans) unless the user specifically asked you to. If the user asks you to style a particular word or phrase that is already included in a larger span, you may split the span into smaller spans in order to apply the style at the granularity requested. Likewise, if two or more adjacent spans have the exact same styling, merge them together.`,
			toString,
		});

		let log = "";
		await agent.runCodeFromPrompt(
			"Please add a comment to the word 'treat' that says 'Makes me think of Halloween :)'",
			(l) => (log += l),
		);

		if (log === undefined) {
			console.error("No log returned from clod");
			throw new Error("No log returned from clod");
		} else {
			writeFileSync("llm_log.md", log, { encoding: "utf8" });
		}
	});

	/**
	 * 1. System prompt
	 * 2. User prompt
	 * 3. PRE - parsed edits
	 * 4. errors, if any
	 * 5. tree state after each edit
	 */

	function toString(page: Page): string {
		let result = "";
		if (page.comments.length > 0) {
			for (let i = 0; i < page.comments.length; i++) {
				const c = page.comments[i] ?? fail("Comment not found");
				result += `#### ${i + 1}: ${c.text}\n\n`;
			}
		}
		result += page.paragraphs
			.map((p) => {
				return p.content
					.map((c) => {
						if (c instanceof Word) {
							return c.characters;
						} else if (c instanceof Span) {
							let text = c.words.map((w) => w.characters).join(" ");
							if (c.bold) {
								text = `**${text}**`;
							}
							if (c.italic) {
								text = `_${text}_`;
							}
							if (c.comments.length > 0) {
								const ids = c.comments
									.map((id) => page.comments.map((co) => co.identifier).indexOf(id) + 1)
									.join(",");

								text = `(${text})^${ids}`;
							}
							return text;
						} else if (c instanceof D8) {
							return `${c.month}/${c.day}/${c.year}`;
						}
					})
					.join(" ");
			})
			.join("\n");

		return result;
	}
});
