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

export class Word extends sf.object("Word", { characters: sf.string }) {}

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
		const view = tree.viewWith(new TreeViewConfiguration({ schema: Page }));
		const today = new Date();
		view.initialize({
			paragraphs: [
				new Paragraph({
					content: [
						new Span({
							words: [new Word({ characters: "This" })],
							bold: false,
							italic: true,
							comments: [],
						}),
						new Word({ characters: "is" }),
						new Word({ characters: "a" }),
						new Span({
							words: [new Word({ characters: "sample" })],
							bold: true,
							italic: false,
							comments: [],
						}),
						new Span({
							words: [new Word({ characters: "paragraph." })],
							bold: false,
							italic: false,
							comments: ["6663f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
						}),
						new Span({
							words: [
								new Word({ characters: "It" }),
								new Word({ characters: "was" }),
								new Word({ characters: "written" }),
								new Word({ characters: "on" }),
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
						new Word({ characters: "." }),
						new Word({ characters: "Use" }),
						new Word({ characters: "the" }),
						new Word({ characters: "chat" }),
						new Word({ characters: "box" }),
						new Word({ characters: "below" }),
						new Word({ characters: "to" }),
						new Word({ characters: "make" }),
						new Word({ characters: "edits." }),
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

		const stringified = JSON.stringify(view.root, undefined, 2);
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

		const stringified2 = JSON.stringify(view.root, undefined, 2);
		console.log(stringified2);
	});
});
