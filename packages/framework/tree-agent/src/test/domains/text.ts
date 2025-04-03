/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactoryAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { fail, llmDefault } from "../../utils.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.text");

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

export function stringifyPage(page: Page): string {
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
