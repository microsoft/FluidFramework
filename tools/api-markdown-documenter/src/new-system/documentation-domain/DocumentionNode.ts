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
    // TODO: rename
    readonly type: DocumentNodeType;

    /**
     * Deep equality comparison.
     */
    equals(other: DocumentationNode): boolean;
}

/**
 * Represents a documentation node that is contractually rendered to a single line (no line breaks allowed).
 */
export interface SingleLineElementNode extends DocumentationNode {}

/**
 * A documentation node that has child nodes.
 */
export interface ParentNode<TDocumentationNode extends DocumentationNode = DocumentationNode>
    extends UnistParent<TDocumentationNode, UnistData>,
        DocumentationNode {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    readonly type: DocumentNodeType;

    readonly children: TDocumentationNode[];
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 */
export interface LiteralNode<T = unknown> extends UnistLiteral<T>, DocumentationNode {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    readonly type: DocumentNodeType;
}

/**
 * Helper base class for {@link ParentNode} implementations.
 */
export abstract class ParentNodeBase<
    TDocumentationNode extends DocumentationNode = DocumentationNode,
> implements ParentNode<TDocumentationNode>
{
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public abstract type: DocumentNodeType;

    /**
     * {@inheritDoc ParentNode.children}
     */
    public readonly children: TDocumentationNode[];

    protected constructor(children: TDocumentationNode[]) {
        this.children = children;
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public abstract equals(other: DocumentationNode): boolean;
}
