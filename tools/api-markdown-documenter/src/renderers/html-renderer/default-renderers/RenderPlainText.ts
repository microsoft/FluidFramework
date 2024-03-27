/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PlainTextNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Renders a {@link PlainTextNode} as HTML.
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
	const text = node.value;
	if (text.length === 0) {
		return;
	}

	// We will render leading and trailing whitespace *outside* of any formatting tags.
	const { leadingWhitespace, body, trailingWhitespace } = splitLeadingAndTrailingWhitespace(
		node.value,
	);

	writer.write(leadingWhitespace); // write leading whitespace

	if (context.bold === true) {
		writer.write("<b>");
	}
	if (context.italic === true) {
		writer.write("<i>");
	}
	if (context.strikethrough === true) {
		writer.write("<s>");
	}

	writer.write(node.escaped ? body : getHtmlEscapedText(body));

	if (context.strikethrough === true) {
		writer.write("</s>");
	}
	if (context.italic === true) {
		writer.write("</i>");
	}
	if (context.bold === true) {
		writer.write("</b>");
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
