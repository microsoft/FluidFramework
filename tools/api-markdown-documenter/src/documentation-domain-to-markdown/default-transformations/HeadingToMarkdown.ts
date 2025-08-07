/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BlockContent as MdastBlockContent,
	Break as MdastBreak,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import type { SectionHeading } from "../../mdast/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Line break singleton.
 */
const lineBreak: MdastBreak = { type: "break" };

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
	headingNode: SectionHeading,
	context: TransformationContext,
): MdastBlockContent[] {
	// Markdown only supports heading levels up to 6. If our level is beyond that, we will transform the input to simple
	// bold text, with an accompanying HTML anchor to ensure we can still link to the text.
	return isInHeadingRange(context.headingLevel)
		? transformAsHeading(headingNode, context.headingLevel)
		: transformAsBoldText(headingNode);
}

function transformAsHeading(
	headingNode: SectionHeading,
	headingLevel: 1 | 2 | 3 | 4 | 5 | 6,
): MdastBlockContent[] {
	const result: MdastBlockContent[] = [];
	if (headingNode.id !== undefined) {
		result.push({
			type: "html",
			value: `<a id="${headingNode.id}"></a>`,
		});
	}

	result.push({
		type: "heading",
		depth: headingLevel,
		children: [
			{
				type: "text",
				value: headingNode.title,
			},
		],
	});

	return result;
}

function transformAsBoldText(headingNode: SectionHeading): MdastBlockContent[] {
	const body: MdastPhrasingContent[] = [];

	if (headingNode.id !== undefined) {
		body.push(
			{
				type: "html",
				value: `<a id="${headingNode.id}"></a>`,
			},
			lineBreak,
		);
	}

	body.push({
		type: "strong",
		children: [
			{
				type: "text",
				value: headingNode.title,
			},
		],
	});

	return [
		{
			type: "paragraph",
			children: body,
		},
	];
}
