/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Kinds of {@link DocumentationNode} known inherently by the system.
 *
 * @remarks Any given {@link DocumentationNode} implementation will specify a unique value as
 * its {@link DocumentationNode."type"}.
 *
 * @public
 */
export enum DocumentationNodeType {
	/**
	 * See {@link AlertNode}
	 */
	Alert = "Alert",

	/**
	 * See {@link BlockQuoteNode}
	 */
	BlockQuote = "BlockQuote",

	/**
	 * See {@link CodeSpanNode}
	 */
	CodeSpan = "CodeSpan",

	/**
	 * See {@link DocumentNode}
	 */
	Document = "Document",

	/**
	 * See {@link FencedCodeBlockNode}
	 */
	FencedCode = "FencedCode",

	/**
	 * See {@link HeadingNode}
	 */
	Heading = "Heading",

	/**
	 * See {@link LineBreakNode}
	 */
	LineBreak = "LineBreak",

	/**
	 * See {@link LinkNode}
	 */
	Link = "Link",

	/**
	 * See {@link HorizontalRuleNode}
	 */
	HorizontalRule = "HorizontalRule",

	/**
	 * See {@link OrderedListNode}
	 */
	OrderedList = "OrderedList",

	/**
	 * See {@link ParagraphNode}
	 */
	Paragraph = "Paragraph",

	/**
	 * See {@link PlainTextNode}
	 */
	PlainText = "PlainText",

	/**
	 * See {@link SectionNode}
	 */
	Section = "Section",

	/**
	 * See {@link SpanNode}
	 */
	Span = "Span",

	/**
	 * See {@link TableNode}
	 */
	Table = "Table",

	/**
	 * See {@link TableCellNode}
	 */
	TableCell = "TableCell",

	/**
	 * See {@link TableRowNode}
	 */
	TableRow = "TableRow",

	/**
	 * See {@link UnorderedListNode}
	 */
	UnorderedList = "UnorderedList",
}
