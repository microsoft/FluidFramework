/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationParentNodeBase,
	DocumentNode,
	documentToMarkdown,
	HeadingNode,
	MarkdownPhrasingContentNode,
	phrasingContentToMarkdown,
	SectionNode,
	type PhrasingContent,
} from "@fluid-tools/api-markdown-documenter";
import type { PhrasingContent as MdastPhrasingContent } from "mdast";

// Define custom node type
export class CustomDocumentationNode extends DocumentationParentNodeBase<PhrasingContent> {
	public readonly type = "customNode";

	constructor(children) {
		super(children);
	}
}

// Extend the `BlockContentMap` interface to include our custom node kind, so it can be used in `SectionNode`s.
declare module "@fluid-tools/api-markdown-documenter" {
	interface BlockContentMap {
		customNode: CustomDocumentationNode;
	}
}

// Use the custom node!
const sectionNode: SectionNode = new SectionNode(
	[
		new CustomDocumentationNode([
			new MarkdownPhrasingContentNode({ type: "text", value: "Hello world!" }),
		]),
	],
	new HeadingNode("Section with custom children!"),
);

const document = new DocumentNode({
	children: [sectionNode],
	documentPath: "./test.md",
});

const markdown = documentToMarkdown(document, {
	customTransformations: {
		customNode: (node, context) => {
			const transformedChildren: MdastPhrasingContent[] = [];
			for (const child of node.children) {
				transformedChildren.push(...phrasingContentToMarkdown(child, context));
			}
			return [
				{
					type: "paragraph",
					children: transformedChildren,
				},
			];
		},
	},
});

// Allow otherwise unused variable above.
// This code is only compiled, not run.
console.log(markdown);
