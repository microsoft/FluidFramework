/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNode, TextFormatting } from "../documentation-domain";
import { DocumentWriter } from "./DocumentWriter";

/**
 * Context passed down during recursive {@link DocumentationNode} rendering.
 */
export interface MarkdownRenderContext extends TextFormatting {
	/**
	 * Whether or not we are currently rendering inside of a table (cell).
	 */
	readonly insideTable: boolean;

	/**
	 * Whether or not we are currently rendering inside of a code block.
	 */
	readonly insideCodeBlock: boolean;

	/**
	 * Whether or not we are currently rendering as a child of some HTML content.
	 */
	readonly insideHtml: boolean;

	/**
	 * Contextual heading level.
	 *
	 * @remarks
	 *
	 * Will automatically increment based on `HierarchicalSection` items encountered such that heading
	 * levels can be increased automatically based on content hierarchy.
	 */
	headingLevel: number;

	/**
	 * Policies for rendering different kinds of {@link DocumentationNode}s.
	 */
	renderers: DocumentationNodeRenderers;
}

/**
 * {@link DocumentationNode} renderer type-signature.
 *
 * @param node - The `DocumentationNode` to render.
 * @param writer - The writing context to render into.
 * @param context - Recursive contextual state.
 */
export type RenderDocumentationNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> = (node: TDocumentationNode, writer: DocumentWriter, context: MarkdownRenderContext) => void;

/**
 * All known node types this renderer supports by default
 */
export interface DocumentationNodeRenderers {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a renderer implementation for that kind of node.
	 */
	[documentationNodeKind: string]: RenderDocumentationNode;
}
