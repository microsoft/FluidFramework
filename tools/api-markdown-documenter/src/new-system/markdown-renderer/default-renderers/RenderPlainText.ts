/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { PlainTextNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Converts a PlainTextNode into markdown
 *
 * @param node - PlainTextNode to convert into markdown
 * @param context - Renderer to provide rendering details about the node
 * @remarks Will strip trailing whitespace and insert HTML bold, italic, and strike tags as informed by the renderer
 * @returns The markdown representation of the PlainTextNode as a string
 */
export function renderPlainText(
	node: PlainTextNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const text = node.value;

	// split out the [ leading whitespace, body, trailing whitespace ]
	const [, leadingWhitespace, body, trailingWhitespace]: string[] =
		text.match(/^(\s*)(.*?)(\s*)$/) ?? [];

	// We will render leading and trailing whitespace *outside* of any formatting.

	writer.write(leadingWhitespace); // write leading whitespace

	if (context.insideHtml) {
		renderPlainTextWithHtmlSyntax(body, writer, context);
	} else {
		renderPlainTextWithMarkdownSyntax(body, writer, context);
	}

	writer.write(trailingWhitespace); // write trailing whitespace
}

function renderPlainTextWithMarkdownSyntax(
	content: string,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (content.length === 0) {
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
			case ">":
				// okay to put a symbol
				break;
			default:
				// This is no problem:        "**one** *two* **three**"
				// But this is trouble:       "**one***two***three**"
				// The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
				writer.write("<!-- -->");
				break;
		}
	}

	if (context.bold === true) {
		writer.write("**");
	}
	if (context.italic === true) {
		writer.write("_");
	}
	if (context.strikethrough === true) {
		writer.write("~~");
	}

	// Don't escape text within a code block in Markdown
	const text = context.insideCodeBlock ? content : getMarkdownEscapedText(content);
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
}

function renderPlainTextWithHtmlSyntax(
	content: string,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.bold === true) {
		writer.write("<b>");
	}
	if (context.italic === true) {
		writer.write("<i>");
	}
	if (context.strikethrough === true) {
		writer.write("<s>");
	}

	writer.write(getHtmlEscapedText(content));

	if (context.strikethrough === true) {
		writer.write("</s>");
	}
	if (context.italic === true) {
		writer.write("</i>");
	}
	if (context.bold === true) {
		writer.write("</b>");
	}
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

/**
 * Escapes text in a way that makes it usable inside of table elements
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function getHtmlEscapedText(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "&#124;");
}
