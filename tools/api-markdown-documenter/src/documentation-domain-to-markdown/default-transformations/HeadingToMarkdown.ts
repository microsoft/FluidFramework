/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Heading as MdastHeading,
	BlockContent as MdastBlockContent,
	Paragraph as MdastParagraph,
	Html as MdastHtml,
	Break,
} from "mdast";

import type { HeadingNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Markdown supports heading levels from 1 to 6, corresponding to HTML's `<h1>` to `<h6>`.
 */
function isInHeadingRange(level: number): level is 1 | 2 | 3 | 4 | 5 | 6 {
	return level >= 1 && level <= 6;
}

/**
 * Transforms a {@link HeadingNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks
 *
 * Observes {@link RenderContext.headingLevel} to determine the heading level to use.
 */
export function headingToMarkdown(
	headingNode: HeadingNode,
	context: TransformationContext,
): MdastBlockContent[] {
	// Markdown only supports heading levels up to 6. If our level is beyond that, we will transform the input to simple
	// bold text, with an accompanying HTML anchor to ensure we can still link to the text.
	return isInHeadingRange(context.headingLevel)
		? transformAsHeading(headingNode, context, context.headingLevel)
		: transformAsBoldText(headingNode, context);
}

function transformAsHeading(
	headingNode: HeadingNode,
	context: TransformationContext,
	headingLevel: 1 | 2 | 3 | 4 | 5 | 6,
): MdastBlockContent[] {
	const { transformations } = context;

	const transformedTitle = transformations[headingNode.title.type](headingNode.title, context);

	if (headingNode.id !== undefined) {
		transformedTitle.push({ type: "text", value: ` {#${headingNode.id}}` });
	}

	const heading: MdastHeading = {
		type: "heading",
		depth: headingLevel,
		children: transformedTitle,
	};
	return [heading];
}

function transformAsBoldText(
	headingNode: HeadingNode,
	context: TransformationContext,
): MdastBlockContent[] {
	const { transformations } = context;

	const transformedTitle = transformations[headingNode.title.type](headingNode.title, context);

	const boldTitle: MdastParagraph = {
		type: "paragraph",
		children: [
			{
				type: "strong",
				children: transformedTitle,
			},
		],
	};

	if (headingNode.id === undefined) {
		return [boldTitle];
	}

	const anchorHtml: MdastHtml = {
		type: "html",
		value: `<a id="${headingNode.id ?? ""}"></a>`,
	};
	const lineBreak: Break = { type: "break" };
	return [
		{
			type: "paragraph",
			children: [anchorHtml, lineBreak, ...boldTitle.children],
		},
	];
}
