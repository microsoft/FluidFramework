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
 *
 * @public
 */
export interface DocumentationNode<TData extends object = UnistData> extends UnistNode<TData> {
	/**
	 * The type of Documentation domain node.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#type}.
	 */
	readonly type: string;
}

/**
 * A documentation node that has child nodes.
 *
 * @see {@link https://github.com/syntax-tree/unist#parent}
 *
 * @public
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
	 * Child nodes.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#parent}.
	 */
	readonly children: TDocumentationNode[];
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 *
 * @see {@link https://github.com/syntax-tree/unist#literal}
 *
 * @public
 */
export interface DocumentationLiteralNode<TValue = unknown>
	extends UnistLiteral<TValue>,
		DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	readonly type: string;

	/**
	 * Node value.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#literal}.
	 */
	readonly value: TValue;
}

/**
 * Helper base class for {@link DocumentationParentNode} implementations.
 *
 * @public
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
	 * {@inheritDoc DocumentationParentNode.children}
	 */
	public readonly children: TDocumentationNode[];

	protected constructor(children: TDocumentationNode[]) {
		this.children = children;
	}
}

/**
 * Helper base class for {@link DocumentationParentNode} implementations.
 *
 * @public
 */
export abstract class DocumentationLiteralNodeBase<TValue = unknown>
	implements DocumentationLiteralNode<TValue>
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public abstract type: string;

	/**
	 * {@inheritDoc DocumentationLiteralNode.value}
	 */
	public readonly value: TValue;

	protected constructor(value: TValue) {
		this.value = value;
	}
}
