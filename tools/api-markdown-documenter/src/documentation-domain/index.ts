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
    Document = "Document",
    Group = "Group",
    Markdown = "Markdown",
    NestedSection = "NestedSection",
    OrderedList = "OrderedList",
    SymbolicLink = "SymbolicLink",
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

export abstract class DocumentParentNodeBase<
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

export class NestedSectionNode extends DocumentParentNodeBase {
    public readonly type = DocumentNodeKind.NestedSection;

    public constructor(children: DocumentDomainNode[]) {
        super(children);
    }
}

export class Group extends DocumentParentNodeBase {
    public readonly type = DocumentNodeKind.Group;

    public constructor(children: DocumentDomainNode[]) {
        super(children);
    }
}

export class MarkdownNode implements LiteralNode<MdastParent> {
    public readonly type = DocumentNodeKind.Markdown;
    public readonly value: MdastParent;

    public constructor(child: MdastParent) {
        this.value = child;
    }
}

export class AlertNode extends DocumentParentNodeBase {
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

export class UnorderedListNode extends DocumentParentNodeBase<
    LiteralNode | UnorderedListNode | OrderedListNode
> {
    public readonly type = DocumentNodeKind.UnorderedList;

    public constructor(children: Array<LiteralNode | UnorderedListNode | OrderedListNode>) {
        super(children);
    }
}

export class OrderedListNode extends DocumentParentNodeBase<
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
