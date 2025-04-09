/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	SchemaFactoryAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { fail } from "../../utils.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
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

export class Page extends sf.object(
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

export function stringifyPage(page: Page): string {
	let result = "";
	if (page.comments.length > 0) {
		for (let i = 0; i < page.comments.length; i++) {
			const c = page.comments[i] ?? fail("Comment not found");
			result += `#### ${i + 1}: ${c.text}\n\n`;
		}
	}
	result += page.paragraphs
		.map((paragraph) => {
			return paragraph.sentences
				.map((sentence) => {
					return sentence.words
						.map((wOrS) => {
							if (wOrS instanceof Word) {
								return stringifyWord(wOrS);
							} else if (wOrS instanceof Span) {
								let text = wOrS.words.map((w) => stringifyWord(w)).join(" ");
								if (wOrS.bold) {
									text = `**${text}**`;
								}
								if (wOrS.italic) {
									text = `_${text}_`;
								}
								if (wOrS.comments.length > 0) {
									const ids = wOrS.comments
										.map((id) => page.comments.map((co) => co.identifier).indexOf(id) + 1)
										.join(",");

									text = `(${text})^${ids}`;
								}
								return text;
							}
							return "";
						})
						.join(" ");
				})
				.join(". ");
		})
		.join("\n\n");

	return result;
}

function stringifyWord(word: Word): string {
	if (!/^[\dA-Za-z]+$/.test(word.characters)) {
		throw new UsageError(`Word contains non-alphanumeric characters: ${word.characters}`);
	}
	return word.characters;
}
