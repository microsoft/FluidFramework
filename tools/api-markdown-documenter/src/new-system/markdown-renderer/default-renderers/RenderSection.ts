/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SectionNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link SectionNode} to generate a markdown representation of the section,
 * possibly including a header element.
 *
 * @param node - `SectionNode` render into Markdown.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks
 *
 * Automatically increases the context's {@link MarkdownRenderContext.headingLevel}, when rendering child contents,
 * such that heading levels increase appropriately through nested sections.
 */
export function renderSection(
	node: SectionNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderHierarchicalSectionWithHtmlSyntax(node, writer, context);
	} else {
		renderHierarchicalSectionWithMarkdownSyntax(node, writer, context);
	}
}

function renderHierarchicalSectionWithMarkdownSyntax(
	node: SectionNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Ensure blank line before new section

	// Render section heading, if one was provided.
	if (node.heading !== undefined) {
		renderNode(node.heading, writer, context);
		writer.ensureSkippedLine(); // Ensure blank line between heading and child content
	}

	renderNodes(node.children, writer, {
		...context,
		headingLevel: context.headingLevel + 1, // Increment heading level for child content
	});
	writer.ensureSkippedLine(); // Ensure blank line after section
}

function renderHierarchicalSectionWithHtmlSyntax(
	node: SectionNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<section>");
	writer.increaseIndent();

	// Render section heading, if one was provided.
	if (node.heading !== undefined) {
		renderNode(node.heading, writer, {
			...context,
			insideHtml: true,
		});
		writer.ensureNewLine(); // Ensure line break after heading element
	}

	renderNodes(node.children, writer, {
		...context,
		headingLevel: context.headingLevel + 1, // Increment heading level for child content
		insideHtml: true,
	});

	writer.decreaseIndent();
	writer.writeLine("</section>");
}
