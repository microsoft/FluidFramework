import type {
	Data as UnistData,
	Literal as UnistLiteral,
	Node as UnistNode,
	Parent as UnistParent,
} from "unist";

// TODOs:
// - Make SingleLineTextNode actually typesafe

/**
 * Base type for documentation nodes.
 */
export interface DocumentationNode<TData extends object = UnistData> extends UnistNode<TData> {
	/**
	 * The type of Documentation domain node.
	 *
	 * See {@link unist#Node."type"}.
	 */
	readonly type: string;
}

/**
 * Represents a documentation node that is contractually rendered to a single line (no line breaks allowed).
 */
export type SingleLineElementNode = DocumentationNode;

/**
 * A documentation node that has child nodes.
 */
export interface ParentNode<TDocumentationNode extends DocumentationNode = DocumentationNode>
	extends UnistParent<TDocumentationNode, UnistData>,
		DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	readonly type: string;

	/**
	 * Child nodes.
	 *
	 * See {@link unist#Parent.children}.
	 */
	readonly children: TDocumentationNode[];
}

/**
 * A documentation node that is a terminal (i.e. has no children).
 */
export interface LiteralNode<T = unknown> extends UnistLiteral<T>, DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	readonly type: string;
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
	public abstract type: string;

	/**
	 * {@inheritDoc ParentNode.children}
	 */
	public readonly children: TDocumentationNode[];

	protected constructor(children: TDocumentationNode[]) {
		this.children = children;
	}
}
