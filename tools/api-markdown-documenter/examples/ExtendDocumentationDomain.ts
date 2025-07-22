/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationParentNodeBase,
	HeadingNode,
	PlainTextNode,
	SectionNode,
	type PhrasingContent,
} from "@fluid-tools/api-markdown-documenter";

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
	[new CustomDocumentationNode([new PlainTextNode("Hello world!")])],
	new HeadingNode("Section with custom children!"),
);

// Allow otherwise unused variable above.
// This code is only compiled, not run.
console.log(sectionNode);
