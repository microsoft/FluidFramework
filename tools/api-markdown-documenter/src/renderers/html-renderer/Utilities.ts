/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type DocumentationNode } from "../../documentation-domain";
import { type DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "./Render";
import { type RenderContext } from "./RenderContext";

/**
 * Renders the provided contents within a tag block of the specified `tagName`.
 *
 * @remarks Handles {@link RenderContext.prettyFormatting}.
 *
 * @param contents - The contents to render within the tag.
 * @param tagName - Tag name to use. E.g. "p" for a \<p\> node.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderContentsUnderTag(
	contents: DocumentationNode[],
	tagName: string,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before tag
	}

	writer.write(`<${tagName}>`);

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.increaseIndent();
	}

	renderNodes(contents, writer, context);

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.decreaseIndent();
	}

	writer.write(`</${tagName}>`);

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break after tag
	}
}

/**
 * Renders a self-closing tag with the provided `tagName`.
 *
 * @remarks Handles {@link RenderContext.prettyFormatting}.
 *
 * @example Line Break
 *
 * ```html
 * <br>
 * ```
 *
 * @param tagName - Tag name to use. E.g. "br" for a \<br\> node.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderSelfClosingTag(
	tagName: string,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before tag
	}

	writer.write(`<${tagName}>`);

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break after tag
	}
}

/**
 * Renders `<li>` items for each of the provided documentation nodes.
 *
 * @remarks Handles {@link RenderContext.prettyFormatting}.
 *
 * @param listItemNodes - The list item nodes to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderListContents(
	listItemNodes: DocumentationNode[],
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before first list item
	}

	for (const listItemNode of listItemNodes) {
		writer.write("<li>");
		if (prettyFormatting) {
			writer.ensureNewLine();
			writer.increaseIndent();
		}

		renderNode(listItemNode, writer, context);

		if (prettyFormatting) {
			writer.ensureNewLine(); // Ensure newline after previous list item
			writer.decreaseIndent();
		}

		writer.write("</li>");

		if (prettyFormatting) {
			writer.ensureNewLine();
		}
	}
}

/**
 * Renders an HTML anchor for the given ID.
 *
 * @param anchorId - The ID of the associated item.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderAnchor(
	anchorId: string,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const prettyFormatting = context.prettyFormatting !== false;
	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before tag
	}

	writer.write(`<a name="${anchorId}" />`);

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break after tag
	}
}
