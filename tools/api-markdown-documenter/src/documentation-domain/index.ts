import { Parent as MdastParent } from "mdast";
import {
    Data as UnistData,
    Literal as UnistLiteral,
    Node as UnistNode,
    Parent as UnistParent,
} from "unist";

import { DocAlertType } from "../doc-nodes";

/**
 * Kind of document domain node. Used to dispatch on different document domain node implementations.
 *
 * @remarks Any given {@link DocumentationNode} implementation will specify a unique value as its {@link DocumentationNode.type}.
 */
export enum DocumentNodeKind {
    Alert = "Alert",
    BlockQuote = "BlockQuote",
    CodeSpan = "CodeSpan",
    Document = "Document",
    FencedCode = "FencedCode",
    LineBreak = "LineBreak",
    Markdown = "Markdown",
    NestedSection = "NestedSection",
    OrderedList = "OrderedList",
    Paragraph = "Paragraph",
    PlainText = "PlainText",
    Span = "Span",
    SymbolicLink = "SymbolicLink",
    Table = "Table",
    TableCell = "TableCell",
    TableRow = "TableRow",
    UnorderedList = "UnorderedList",
    UrlLink = "UrlLink",
}

/**
 * Base type for documentation nodes.
 */
export interface DocumentationNode<TData extends object = UnistData> extends UnistNode<TData> {
    readonly type: DocumentNodeKind;
}

/**
 * Represents a documentation node that is contractually rendered to a single line (no line breaks allowed).
 */
export interface SingleLineElementNode extends DocumentationNode {}

/**
 * A documentation node that has child nodes.
 */
export interface ParentNode<TDocumentNode extends DocumentationNode = DocumentationNode>
    extends UnistParent<TDocumentNode, UnistData>,
        DocumentationNode {
    readonly type: DocumentNodeKind;
    readonly children: TDocumentNode[];
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 */
export interface LiteralNode<T = unknown> extends UnistLiteral<T>, DocumentationNode {
    readonly type: DocumentNodeKind;
}

/**
 * Helper base class for {@link ParentNode} implementations.
 */
export abstract class ParentNodeBase<TDocumentNode extends DocumentationNode = DocumentationNode>
    implements ParentNode<TDocumentNode>
{
    public abstract type: DocumentNodeKind;

    public readonly children: TDocumentNode[];

    protected constructor(children: TDocumentNode[]) {
        this.children = children;
    }
}

// TODOs:
// Take in an optional title?
// Take in optional front-matter?
// Take in optional Header / footer?

/**
 * Represents the root of a document.
 */
export class DocumentNode implements UnistParent<DocumentationNode> {
    public readonly type = DocumentNodeKind.Document;

    public readonly children: DocumentationNode[];
    public readonly filePath: string;

    public constructor(children: DocumentationNode[], filePath: string) {
        this.children = children;
        this.filePath = filePath;
    }
}

// TODOs:
// - Only Documents and Sections may contain Sections?
// - Explicitly take in a Heading?

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation, etc.
 *
 * @example TODO
 */
export class HierarchicalSectionNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.NestedSection;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}

export interface TextFormatting {
    /**
     * @defaultValue Inherit
     */
    italics?: boolean;

    /**
     * @defaultValue Inherit
     */
    bold?: boolean;

    /**
     * @defaultValue Inherit
     */
    strikethrough?: boolean;

    // TODO: underline?
    // TODO: what else?
}

export class SpanNode<
    TDocumentNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentNode> {
    public readonly type = DocumentNodeKind.Span;

    /**
     * @defaultValue Inherit
     */
    public readonly textFormatting?: TextFormatting;

    public constructor(children: TDocumentNode[], formatting?: TextFormatting) {
        super(children);
        this.textFormatting = formatting;
    }
}

export class MarkdownNode implements LiteralNode<MdastParent> {
    public readonly type = DocumentNodeKind.Markdown;
    public readonly value: MdastParent;

    public constructor(child: MdastParent) {
        this.value = child;
    }
}

export class AlertNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.Alert;
    public readonly alertKind: DocAlertType;

    public constructor(children: DocumentationNode[], alertKind: DocAlertType) {
        super(children);
        this.alertKind = alertKind;
    }
}

export interface UrlLink {
    urlTarget: string;
    content?: SingleLineElementNode;
}

export type SymbolicLinkTarget = unknown; // TODO

export interface SymbolicLink {
    symbolTarget: SymbolicLinkTarget;
    content?: SingleLineElementNode;
}

export class UrlLinkNode implements LiteralNode<UrlLink>, SingleLineElementNode {
    public readonly type = DocumentNodeKind.UrlLink;
    public readonly value: UrlLink;

    public constructor(link: UrlLink) {
        this.value = link;
    }
}

export class SymbolicLinkNode implements LiteralNode<SymbolicLink>, SingleLineElementNode {
    public readonly type = DocumentNodeKind.SymbolicLink;
    public readonly value: SymbolicLink;

    public constructor(link: SymbolicLink) {
        this.value = link;
    }
}

export class UnorderedListNode extends ParentNodeBase<SingleLineElementNode> {
    public readonly type = DocumentNodeKind.UnorderedList;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }
}

export class OrderedListNode extends ParentNodeBase<SingleLineElementNode> {
    public readonly type = DocumentNodeKind.OrderedList;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }
}

export class HeadingNode implements LiteralNode<SingleLineElementNode> {
    public readonly type = DocumentNodeKind.Markdown;

    public readonly value: SingleLineElementNode;
    public readonly id?: string;

    /**
     * Heading level.
     *
     * @remarks Must be on [0, inf].
     *
     * @defaultValue Automatic based on {@link NestedSection | section} hierarchy.
     */
    public readonly level?: number;

    public constructor(content: SingleLineElementNode, id?: string, level?: number) {
        this.value = content;
    }
}

/**
 * @example `Foo`
 */
export class CodeSpanNode extends ParentNodeBase<SingleLineElementNode> implements SingleLineElementNode {
    public readonly type = DocumentNodeKind.CodeSpan;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }
}

export type FencedCodeChildren = LineBreakNode | SingleLineElementNode;

/**
 * @example
 * ```md
 * ```typescrpt
 * const foo = "bar";
 * ```
 * ```
 */
export class FencedCodeNode extends ParentNodeBase<FencedCodeChildren> {
    public readonly type = DocumentNodeKind.FencedCode;

    /**
     * @defaultValue No language tag
     */
    public readonly language?: string;

    public constructor(children: FencedCodeChildren[], language?: string) {
        super(children);
        this.language = language;
    }
}

export class TableCellNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.TableCell;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}

export class TableRowNode extends ParentNodeBase<TableCellNode> {
    public readonly type = DocumentNodeKind.TableRow;

    public constructor(cells: TableCellNode[]) {
        super(cells);
    }
}

export class TableNode extends ParentNodeBase<TableRowNode> {
    public readonly type = DocumentNodeKind.Table;

    public readonly headingRow?: TableRowNode[];

    public constructor(bodyRows: TableRowNode[], headingRow?: TableRowNode[]) {
        super(bodyRows);
        this.headingRow = headingRow;
    }
}

export type ParagraphChildren =
    | LineBreakNode
    | SingleLineElementNode
    | SpanNode<LineBreakNode | SingleLineElementNode>;

export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
    public readonly type = DocumentNodeKind.Paragraph;

    public constructor(children: ParagraphChildren[]) {
        super(children);
    }
}

export class PlainTextNode implements LiteralNode<string>, SingleLineElementNode {
    public readonly type = DocumentNodeKind.PlainText;
    public readonly value: string;

    public constructor(value: string) {
        this.value = value;
    }
}

export class LineBreakNode implements DocumentationNode {
    public readonly type = DocumentNodeKind.LineBreak;

    // TODO: do we want this?
    public static readonly Singleton = new LineBreakNode();

    public constructor() {}
}

/**
 *
 * @example
 * ```md
 * > Foo
 * >
 * > Bar
 * ```
 */
export class BlockQuoteNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.BlockQuote;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}
