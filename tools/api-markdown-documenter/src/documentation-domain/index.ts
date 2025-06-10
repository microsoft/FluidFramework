/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * {@link https://en.wikipedia.org/wiki/Abstract_syntax_tree | AST} domain describing documentation content.
 *
 * @remarks
 *
 * Implemented using {@link https://github.com/syntax-tree/unist | unist}.
 *
 * Can be rendered to the documentation language of your choice by using one of this library's render
 * transformations, or by writing your own!
 */

export type { BlockContent, BlockContentMap } from "./BlockContent.js";
export { CodeSpanNode } from "./CodeSpanNode.js";
export {
	DocumentNode,
	type DocumentNodeProperties as DocumentNodeProps,
} from "./DocumentNode.js";
export {
	type DocumentationNode,
	type DocumentationLiteralNode,
	DocumentationLiteralNodeBase,
	type DocumentationParentNode,
	DocumentationParentNodeBase,
} from "./DocumentationNode.js";
export { FencedCodeBlockNode } from "./FencedCodeBlockNode.js";
export { HeadingNode } from "./HeadingNode.js";
export { HorizontalRuleNode } from "./HorizontalRuleNode.js";
export { LineBreakNode } from "./LineBreakNode.js";
export { LinkNode } from "./LinkNode.js";
export { OrderedListNode } from "./OrderedListNode.js";
export { ParagraphNode } from "./ParagraphNode.js";
export type { PhrasingContent, PhrasingContentMap } from "./PhrasingContent.js";
export { PlainTextNode } from "./PlainTextNode.js";
export { type SectionContent, SectionNode } from "./SectionNode.js";
export { SpanNode } from "./SpanNode.js";
export {
	type TableCellContent,
	TableCellNode,
	TableBodyCellNode,
	TableHeaderCellNode,
	TableCellKind,
} from "./TableCellNode.js";
export {
	TableRowNode,
	TableBodyRowNode,
	TableHeaderRowNode,
	TableRowKind,
} from "./TableRowNode.js";
export { TableNode } from "./TableNode.js";
export type { TextFormatting } from "./TextFormatting.js";
export { UnorderedListNode } from "./UnorderedListNode.js";
