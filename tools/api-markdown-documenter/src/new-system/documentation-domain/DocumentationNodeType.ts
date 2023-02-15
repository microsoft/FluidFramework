/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Kinds of {@link DocumentationNode} known inherently by the system.
 *
 * @remarks Any given {@link DocumentationNode} implementation will specify a unique value as
 * its {@link DocumentationNode."type"}.
 */
export enum DocumentationNodeType {
	Alert = "Alert",
	BlockQuote = "BlockQuote",
	CodeSpan = "CodeSpan",
	Document = "Document",
	FencedCode = "FencedCode",
	Heading = "Heading",
	LineBreak = "LineBreak",
	Link = "Link",
	HierarchicalSection = "HierarchicalSection",
	HorizontalRule = "HorizontalRule",
	OrderedList = "OrderedList",
	Paragraph = "Paragraph",
	PlainText = "PlainText",
	Span = "Span",
	Table = "Table",
	TableCell = "TableCell",
	TableRow = "TableRow",
	UnorderedList = "UnorderedList",
}
