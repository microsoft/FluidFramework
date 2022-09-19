import { Parent as MdastParent } from "mdast";
import {
    Data as UnistData,
    Literal as UnistLiteral,
    Node as UnistNode,
    Parent as UnistParent,
} from "unist";

import { DocAlertType } from "../doc-nodes";

export enum DocumentNodeKind {
    Alert = "Alert",
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

export interface DocumentDomainNode<TData extends object = UnistData> extends UnistNode<TData> {
    readonly type: DocumentNodeKind;
}

export interface ParentNode<TDocumentNode extends DocumentDomainNode = DocumentDomainNode>
    extends UnistParent<TDocumentNode, UnistData>,
        DocumentDomainNode {
    readonly type: DocumentNodeKind;
    readonly children: TDocumentNode[];
}

export interface LiteralNode<T = unknown> extends UnistLiteral<T>, DocumentDomainNode {
    readonly type: DocumentNodeKind;
}

export abstract class ParentNodeBase<
    TDocumentNode extends DocumentDomainNode = DocumentDomainNode,
> implements ParentNode<TDocumentNode>
{
    public abstract type: DocumentNodeKind;

    public readonly children: TDocumentNode[];

    protected constructor(children: TDocumentNode[]) {
        this.children = children;
    }
}

export class DocumentNode implements UnistParent<DocumentDomainNode> {
    public readonly type = DocumentNodeKind.Document;

    public readonly children: DocumentDomainNode[];
    public readonly filePath: string;

    public constructor(children: DocumentDomainNode[], filePath: string) {
        this.children = children;
        this.filePath = filePath;
    }
}

export class NestedSectionNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.NestedSection;

    public constructor(children: DocumentDomainNode[]) {
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

export class Span extends ParentNodeBase {
    public readonly type = DocumentNodeKind.Span;

    /**
     * @defaultValue Inherit
     */
    public readonly formatting?: TextFormatting;

    public constructor(children: DocumentDomainNode[], formatting?: TextFormatting) {
        super(children);
        this.formatting = formatting;
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

    public constructor(children: DocumentDomainNode[], alertKind: DocAlertType) {
        super(children);
        this.alertKind = alertKind;
    }
}

export interface UrlLink {
    urlTarget: string;
    text?: string;
}

export type SymbolicLinkTarget = unknown; // TODO

export interface SymbolicLink {
    symbolTarget: SymbolicLinkTarget;
    text?: string;
}

export class UrlLinkNode implements LiteralNode<UrlLink> {
    public readonly type = DocumentNodeKind.UrlLink;
    public readonly value: UrlLink;

    public constructor(link: UrlLink) {
        this.value = link;
    }
}

export class SymbolicLinkNode implements LiteralNode<SymbolicLink> {
    public readonly type = DocumentNodeKind.SymbolicLink;
    public readonly value: SymbolicLink;

    public constructor(link: SymbolicLink) {
        this.value = link;
    }
}

export class UnorderedListNode extends ParentNodeBase<
    LiteralNode | UnorderedListNode | OrderedListNode
> {
    public readonly type = DocumentNodeKind.UnorderedList;

    public constructor(children: Array<LiteralNode | UnorderedListNode | OrderedListNode>) {
        super(children);
    }
}

export class OrderedListNode extends ParentNodeBase<
    LiteralNode | UnorderedListNode | OrderedListNode
> {
    public readonly type = DocumentNodeKind.OrderedList;

    public constructor(children: Array<LiteralNode | UnorderedListNode | OrderedListNode>) {
        super(children);
    }
}

export class HeadingNode implements LiteralNode<DocumentDomainNode> {
    public readonly type = DocumentNodeKind.Markdown;

    public readonly value: DocumentDomainNode;
    public readonly id?: string;

    /**
     * Heading level.
     *
     * @remarks Must be on [0, inf].
     *
     * @defaultValue Automatic based on {@link NestedSection | section} hierarchy.
     */
    public readonly level?: number;

    public constructor(content: DocumentDomainNode, id?: string, level?: number) {
        this.value = content;
    }
}

/**
 * @example `Foo`
 */
export class CodeSpanNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.CodeSpan;

    public constructor(children: DocumentDomainNode[]) {
        super(children);
    }
}

export class FencedCodeNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.FencedCode;

    /**
     * @defaultValue No language tag
     */
    public readonly language?: string;

    public constructor(children: DocumentDomainNode[], language?: string) {
        super(children);
        this.language = language;
    }
}

 export class TableCellNode extends ParentNodeBase {
    public readonly type = DocumentNodeKind.TableCell;

    public constructor(children: DocumentDomainNode[]) {
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

    public constructor(bodyRows: TableCellNode[], headingRow?: TableRowNode[]) {
        super(bodyRows);
        this.headingRow = headingRow;
    }
}
