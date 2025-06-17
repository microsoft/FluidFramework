/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Html as MdastHtml,
	List as MdastList,
	ListItem as MdastListItem,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import { renderHtml } from "../../HtmlRendererModule.js";
import type { DocumentationNode, TextFormatting } from "../../documentation-domain/index.js";
import {
	documentationNodeToHtml,
	type TransformationConfiguration as HtmlTransformationConfiguration,
} from "../../documentation-domain-to-html/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * TODO
 */
export function transformAsHtml(
	nodes: DocumentationNode,
	context: TransformationContext,
): MdastHtml {
	const htmlTransformationConfig: HtmlTransformationConfiguration = {
		startingHeadingLevel: context.headingLevel,
		rootFormatting: {
			italic: context.italic,
			bold: context.bold,
			strikethrough: context.strikethrough,
		},
		logger: context.logger,
	};
	const htmlTree = documentationNodeToHtml(nodes, htmlTransformationConfig);
	const htmlString = renderHtml(htmlTree, {});

	return {
		type: "html",
		value: htmlString,
	};
}

/**
 * TODO
 */
export function createList(
	items: readonly MdastPhrasingContent[],
	ordered: boolean,
): MdastList {
	const wrappedChildren: MdastListItem[] = items.map((item) => {
		const listItem: MdastListItem = {
			type: "listItem",
			children: [
				{
					type: "paragraph",
					children: [item],
				},
			],
		};
		return listItem;
	});

	return {
		type: "list",
		ordered,
		children: wrappedChildren,
	};
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
export function applyFormatting(
	tree: MdastPhrasingContent,
	context: TextFormatting,
): MdastPhrasingContent {
	let result: MdastPhrasingContent = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (context.strikethrough === true) {
		result = {
			type: "delete",
			children: [result],
		};
	}
	if (context.italic === true) {
		result = {
			type: "emphasis",
			children: [result],
		};
	}
	if (context.bold === true) {
		result = {
			type: "strong",
			children: [result],
		};
	}

	return result;
}
