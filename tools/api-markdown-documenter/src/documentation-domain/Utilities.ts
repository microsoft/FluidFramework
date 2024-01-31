/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type DocumentationNode, type SingleLineDocumentationNode } from "./DocumentationNode";
import { LineBreakNode } from "./LineBreakNode";
import { PlainTextNode } from "./PlainTextNode";

/**
 * Splits plain text (potentially including line breaks) into {@link PlainTextNode}s and {@link LineBreakNode}s as
 * appropriate to preserve the invariant that `PlainTextNode`s do not include line breaks.
 */
export function createNodesFromPlainText(text: string): (PlainTextNode | LineBreakNode)[] {
	if (text.length === 0) {
		return [PlainTextNode.Empty];
	}

	const lines = text.split(/\r?\n/g);

	const transformedLines: (PlainTextNode | LineBreakNode)[] = [];
	for (const [index, line] of lines.entries()) {
		if (line.length === 0) {
			transformedLines.push(LineBreakNode.Singleton);
		} else {
			transformedLines.push(new PlainTextNode(line));
		}

		// Push line break between each entry (not after last entry)
		if (index !== lines.length - 1) {
			transformedLines.push(LineBreakNode.Singleton);
		}
	}
	return transformedLines;
}

/**
 * Asserts that all provided nodes in the list are {@link DocumentationNode.singleLine | single-line}.
 */
export function assertNodesAreSingleLine(
	nodes: DocumentationNode[],
): asserts nodes is SingleLineDocumentationNode[] {
	for (const node of nodes) {
		if (!node.singleLine) {
			throw new Error("List of nodes contains 1 or more multi-line nodes.");
		}
	}
}

/**
 * Asserts that the provided node is {@link DocumentationNode.singleLine | single-line}.
 */
export function assertNodeIsSingleLine(
	node: DocumentationNode,
): asserts node is SingleLineDocumentationNode {
	if (!node.singleLine) {
		throw new Error("Node is multi-line.");
	}
}
