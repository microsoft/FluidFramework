/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EscapedTextNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";

import { splitLeadingAndTrailingWhitespace } from "./RenderPlainText.js";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Renders a {@link EscapedTextNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderEscapedText(
	node: EscapedTextNode,
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

	writer.write(body);

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
