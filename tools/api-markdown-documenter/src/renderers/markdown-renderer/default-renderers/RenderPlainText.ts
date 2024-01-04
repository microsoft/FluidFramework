/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { PlainTextNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import type { RenderContext } from "../RenderContext";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Renders a {@link PlainTextNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderPlainText(
	node: PlainTextNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	if (node.text.length === 0) {
		return;
	}

	const anyFormatting =
		context.bold === true || context.italic === true || context.strikethrough === true;
	if (anyFormatting) {
		switch (writer.peekLastCharacter()) {
			case "":
			case "\n":
			case " ":
			case "[":
			case ">": {
				// okay to put a symbol
				break;
			}
			default: {
				// This is no problem:        "**one** *two* **three**"
				// But this is trouble:       "**one***two***three**"
				// The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
				writer.write("<!-- -->");
				break;
			}
		}
	}

	// We will render leading and trailing whitespace *outside* of any formatting.
	const { leadingWhitespace, body, trailingWhitespace } = splitLeadingAndTrailingWhitespace(
		node.value,
	);

	writer.write(leadingWhitespace); // write leading whitespace

	if (context.bold === true) {
		writer.write("**");
	}
	if (context.italic === true) {
		writer.write("_");
	}
	if (context.strikethrough === true) {
		writer.write("~~");
	}

	// Don't escape text within a code block in Markdown, or if it has already been escaped
	const text =
		context.insideCodeBlock === true || node.escaped ? body : getMarkdownEscapedText(body);
	writer.write(text);

	if (context.strikethrough === true) {
		writer.write("~~");
	}
	if (context.italic === true) {
		writer.write("_");
	}
	if (context.bold === true) {
		writer.write("**");
	}

	writer.write(trailingWhitespace); // write trailing whitespace
}

interface SplitTextResult {
	leadingWhitespace: string;
	body: string;
	trailingWhitespace: string;
}

function splitLeadingAndTrailingWhitespace(text: string): SplitTextResult {
	// split out the [ leading whitespace, body, trailing whitespace ]
	const [, leadingWhitespace, body, trailingWhitespace]: string[] =
		text.match(/^(\s*)(.*?)(\s*)$/) ?? [];

	return {
		leadingWhitespace,
		body,
		trailingWhitespace,
	};
}

/**
 * Converts text into an escaped, html-nesting-friendly form
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function getMarkdownEscapedText(text: string): string {
	return text
		.replace(/\\/g, "\\\\") // first replace the escape character
		.replace(/[#*[\]_`|~]/g, (x) => `\\${x}`) // then escape any special characters
		.replace(/---/g, "\\-\\-\\-") // hyphens only if it's 3 or more
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
