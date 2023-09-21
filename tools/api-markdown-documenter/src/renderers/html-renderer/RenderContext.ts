/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TextFormatting } from "../../documentation-domain";
import type { Renderers } from "./configuration";

/**
 * Context passed down during recursive {@link DocumentationNode} rendering.
 *
 * @alpha
 */
export interface RenderContext extends TextFormatting {
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
	customRenderers?: Renderers;
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
