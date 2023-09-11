/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TextFormatting } from "../documentation-domain";
import { MarkdownRenderers, getRenderersWithDefaults } from "./configuration";

/**
 * Context passed down during recursive {@link DocumentationNode} rendering.
 *
 * @public
 */
export interface MarkdownRenderContext extends TextFormatting {
	/**
	 * Whether or not we are currently rendering inside of a table context.
	 *
	 * @remarks
	 *
	 * Certain kinds of Markdown content (namely, multi-line contents) cannot be correctly rendered
	 * within a Markdown table cell. To work around this, we render some kinds of child content as HTML when
	 * inside of a table cell context.
	 *
	 * @defaultValue `false`
	 */
	readonly insideTable?: boolean;

	/**
	 * Whether or not we are currently rendering inside of a code block.
	 *
	 * @remarks
	 *
	 * Textual content within code blocks must not be escaped, in order to be Markdown compatible.
	 * We use this flag during rendering to determine whether or not we may escape contents.
	 *
	 * @defaultValue `false`
	 */
	readonly insideCodeBlock?: boolean;

	/**
	 * Whether or not we are currently rendering as a child of some HTML content, within the Markdown document.
	 *
	 * @remarks
	 *
	 * Any content being rendered in an HTML context must also be rendered as HTML.
	 * I.e. Markdown content may contain HTML content, but not vice-versa.
	 *
	 * @defaultValue `false`
	 */
	readonly insideHtml?: boolean;

	/**
	 * Contextual heading level.
	 *
	 * @remarks
	 *
	 * Will automatically increment based on {@link SectionNode}s encountered, such that heading
	 * levels can be increased automatically based on content hierarchy.
	 */
	headingLevel: number;

	/**
	 * Configuration for rendering different kinds of {@link DocumentationNode}s.
	 *
	 * @remarks
	 *
	 * Will include default renderers for all {@link DocumentationNode} types enumerated in
	 * {@link DocumentationNodeType}.
	 */
	renderers: MarkdownRenderers;
}

/**
 * Constructs a {@link MarkdownRenderContext} using provided optional parameters, and filling in the rest with
 * system defaults.
 */
export function getContextWithDefaults(
	partialContext: Partial<MarkdownRenderContext> | undefined,
): MarkdownRenderContext {
	const renderers = getRenderersWithDefaults(partialContext?.renderers);
	return {
		headingLevel: 1,
		...partialContext,
		renderers,
	};
}
