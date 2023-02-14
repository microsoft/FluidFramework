/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link HierarchicalSectionNode} to generate a markdown representation of the section, possibly including a header element.
 *
 * @param node - HierarchicalSectionNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @remarks Automatically increases the hierarchical depth on the renderer, so that any header descendants rendered in the subtree will have an appropriate heading level.
 * @returns The markdown representation of the HierarchicalSectionNode as a string
 */
export function renderHierarchicalSection(
	node: HierarchicalSectionNode,
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
	node: HierarchicalSectionNode,
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
	node: HierarchicalSectionNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<section>");
	writer.increaseIndent();

	// Render section heading, if one was provided.
	if (node.heading !== undefined) {
		renderNode(node.heading, writer, { ...context, insideHtml: true });
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
