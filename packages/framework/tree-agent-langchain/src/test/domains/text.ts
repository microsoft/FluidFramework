/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

// eslint-disable-next-line @eslint-community/eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.text");

export class Word extends sf.object("Word", {
	characters: sf.required(sf.string, {
		metadata: {
			description:
				"The characters that comprise the word. Only alphanumeric characters are permitted.",
		},
	}),
}) {}

export class Span extends sf.object("Span", {
	words: sf.array(Word),
	bold: sf.required(sf.boolean),
	italic: sf.required(sf.boolean),
	comments: sf.required(sf.array(sf.string), {
		metadata: {
			description:
				"The identifiers of all comments that are associated with this decoration. The list of comments and their respective IDs is under the Page object.",
		},
	}),
}) {}

export class Sentence extends sf.object("Sentence", {
	words: sf.required(sf.array([Word, Span]), {
		metadata: { description: "A sentence is a sequence of words" },
	}),
}) {}

export class Paragraph extends sf.object("Paragraph", {
	sentences: sf.array(Sentence),
}) {}

export class Comment extends sf.object("Comment", {
	identifier: sf.required(sf.string, {
		metadata: {
			description: `A unique ID that allows this comment to be referenced in the "comments" field of a Decoration.`,
		},
	}),
	text: sf.string,
}) {}

export class Page extends sf.objectAlpha(
	"Page",
	{
		paragraphs: sf.array(Paragraph),
		comments: sf.array(Comment),
	},
	{
		metadata: {
			description:
				"A page of text. It may contain multiple paragraphs. Arbitrary spans of words can be bolded or italicized if desired.",
		},
	},
) {}
