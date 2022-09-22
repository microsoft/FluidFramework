import {
    Data as UnistData,
    Literal as UnistLiteral,
    Node as UnistNode,
    Parent as UnistParent,
} from "unist";

import { DocumentNodeType } from "./DocumentationNodeType";

/**
 * Base type for documentation nodes.
 */
export interface DocumentationNode<TData extends object = UnistData> extends UnistNode<TData> {
    readonly type: DocumentNodeType;
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
    readonly type: DocumentNodeType;
    readonly children: TDocumentNode[];
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 */
export interface LiteralNode<T = unknown> extends UnistLiteral<T>, DocumentationNode {
    readonly type: DocumentNodeType;
}

/**
 * Helper base class for {@link ParentNode} implementations.
 */
export abstract class ParentNodeBase<TDocumentNode extends DocumentationNode = DocumentationNode>
    implements ParentNode<TDocumentNode>
{
    public abstract type: DocumentNodeType;

    public readonly children: TDocumentNode[];

    protected constructor(children: TDocumentNode[]) {
        this.children = children;
    }
}
