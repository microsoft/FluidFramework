/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SectionNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link SectionNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks
 *
 * Automatically increases the context's {@link MarkdownRenderContext.headingLevel}, when rendering child contents,
 * such that heading levels increase appropriately through nested sections.
 *
 * Will render as HTML when in an HTML context, or within a table context.
 */
export function renderSection(
	node: SectionNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a section in a table context, we will render using HTML syntax.
	if (context.insideTable === true || context.insideHtml === true) {
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
