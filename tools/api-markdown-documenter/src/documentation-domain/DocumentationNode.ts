/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	Data as UnistData,
	Literal as UnistLiteral,
	Node as UnistNode,
	Parent as UnistParent,
} from "unist";

/**
 * Base type for documentation nodes.
 *
 * @typeParam TData - The kind of data used by the node to represent its child content.
 * See {@link https://github.com/syntax-tree/unist#data}.
 */
export interface DocumentationNode<TData extends object = UnistData> extends UnistNode<TData> {
	/**
	 * The type of Documentation domain node.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#type}.
	 */
	readonly type: string;

	/**
	 * Whether or not this node is a {@link https://github.com/syntax-tree/unist#literal | Literal}.
	 *
	 * @remarks If true, `this` is a {@link DocumentationLiteralNode}.
	 */
	readonly isLiteral: boolean;

	/**
	 * Whether or not this node is a {@link https://github.com/syntax-tree/unist#parent | Parent}.
	 *
	 * @remarks If true, `this` is a {@link DocumentationParentNode}.
	 */
	readonly isParent: boolean;

	/**
	 * Whether or not the content of the node fits on a single line.
	 *
	 * @remarks
	 *
	 * Certain classes of items are required to be single-line only, and will use this flag to violate
	 * child contents, etc.
	 */
	readonly singleLine: boolean;
}

/**
 * A {@link DocumentationNode} that is contractually rendered to a single line (no line breaks allowed).
 */
export interface SingleLineDocumentationNode<TData extends object = UnistData>
	extends DocumentationNode<TData> {
	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	readonly singleLine: true;
}

/**
 * A {@link DocumentationNode} that is contractually rendered as more than 1 line.
 */
export interface MultiLineDocumentationNode<TData extends object = UnistData>
	extends DocumentationNode<TData> {
	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	readonly singleLine: false;
}

/**
 * A documentation node that has child nodes.
 *
 * @see {@link https://github.com/syntax-tree/unist#parent}
 */
export interface DocumentationParentNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> extends UnistParent<TDocumentationNode, UnistData>,
		DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	readonly type: string;

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	readonly isLiteral: false;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	readonly isParent: true;

	/**
	 * Child nodes.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#parent}.
	 */
	readonly children: TDocumentationNode[];

	/**
	 * Whether or not the node has any {@link DocumentationParentNode.children}.
	 */
	readonly hasChildren: boolean;
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 *
 * @see {@link https://github.com/syntax-tree/unist#literal}
 */
export interface DocumentationLiteralNode<TValue = unknown>
	extends UnistLiteral<TValue>,
		DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	readonly type: string;

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	readonly isLiteral: true;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	readonly isParent: false;

	/**
	 * Node value.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#literal}.
	 */
	readonly value: TValue;
}

/**
 * Helper base class for {@link DocumentationParentNode} implementations.
 */
export abstract class DocumentationParentNodeBase<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> implements DocumentationParentNode<TDocumentationNode>
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public abstract type: string;

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	public readonly isLiteral = false;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	public readonly isParent = true;

	/**
	 * {@inheritDoc DocumentationParentNode.children}
	 */
	public readonly children: TDocumentationNode[];

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public get singleLine(): boolean {
		for (const child of this.children) {
			if (!child.singleLine) {
				return false;
			}
		}
		return true;
	}

	protected constructor(children: TDocumentationNode[]) {
		this.children = children;
	}

	/**
	 * {@inheritDoc DocumentationParentNode.hasChildren}
	 */
	public get hasChildren(): boolean {
		return this.children.length > 0;
	}
}

/**
 * Helper base class for {@link DocumentationParentNode} implementations.
 */
export abstract class DocumentationLiteralNodeBase<TValue = unknown>
	implements DocumentationLiteralNode<TValue>
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public abstract type: string;

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	public readonly isLiteral = true;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	public readonly isParent = false;

	/**
	 * {@inheritDoc DocumentationLiteralNode.value}
	 */
	public readonly value: TValue;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public abstract get singleLine(): boolean;

	protected constructor(value: TValue) {
		this.value = value;
	}
}
