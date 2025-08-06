/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BlockContent as MdastBlockContent,
	Break as MdastBreak,
	Heading as MdastHeading,
	Html as MdastHtml,
	Strong as MdastStrong,
} from "mdast";

import type { IdentifiableHeading } from "../../mdast/index.js";
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
	headingNode: IdentifiableHeading,
	context: TransformationContext,
): MdastBlockContent[] {
	// Markdown only supports heading levels up to 6. If our level is beyond that, we will transform the input to simple
	// bold text, with an accompanying HTML anchor to ensure we can still link to the text.
	return isInHeadingRange(context.headingLevel)
		? transformAsHeading(headingNode, context.headingLevel)
		: transformAsBoldText(headingNode);
}

function transformAsHeading(
	headingNode: IdentifiableHeading,
	headingLevel: 1 | 2 | 3 | 4 | 5 | 6,
): MdastBlockContent[] {
	let headingText: string = headingNode.title;
	if (headingNode.id !== undefined) {
		headingText = `${headingText} {#${headingNode.id}}`;
	}

	const heading: MdastHeading = {
		type: "heading",
		depth: headingLevel,
		children: [
			{
				type: "text",
				value: headingText,
			},
		],
	};

	return [heading];
}

function transformAsBoldText(headingNode: IdentifiableHeading): MdastBlockContent[] {
	const boldText: MdastStrong = {
		type: "strong",
		children: [
			{
				type: "text",
				value: headingNode.title,
			},
		],
	};

	if (headingNode.id === undefined) {
		return [
			{
				type: "paragraph",
				children: [boldText],
			},
		];
	}

	const anchorHtml: MdastHtml = {
		type: "html",
		value: `<a id="${headingNode.id}"></a>`,
	};
	const lineBreak: MdastBreak = { type: "break" };
	return [
		{
			type: "paragraph",
			children: [anchorHtml, lineBreak, boldText],
		},
	];
}
