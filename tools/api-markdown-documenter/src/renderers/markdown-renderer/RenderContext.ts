/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextFormatting } from "../../documentation-domain/index.js";

import type { Renderers } from "./configuration/index.js";

/**
 * Context passed down during recursive {@link DocumentationNode} rendering.
 *
 * @public
 */
export interface RenderContext extends TextFormatting {
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
	 * Contextual heading level.
	 *
	 * @remarks
	 *
	 * Will automatically increment based on {@link SectionNode}s encountered, such that heading
	 * levels can be increased automatically based on content hierarchy.
	 */
	readonly headingLevel: number;

	/**
	 * Configuration for rendering different kinds of {@link DocumentationNode}s.
	 *
	 * @remarks
	 *
	 * Will include default renderers for all {@link DocumentationNode} types enumerated in
	 * {@link DocumentationNodeType}.
	 */
	readonly customRenderers?: Renderers;
}

/**
 * Constructs a {@link RenderContext} using provided optional parameters, and filling in the rest with
 * system defaults.
 */
export function getContextWithDefaults(
	partialContext: Partial<RenderContext> | undefined,
): RenderContext {
	const headingLevel = partialContext?.headingLevel ?? 1;
	return {
		...partialContext,
		headingLevel,
	};
}
