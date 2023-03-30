/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains a type system for describing visual descriptors of data objects in a serializable
 * tree format that can be broadcast by the debugger for external tools to consume.
 */

/**
 * A unique ID for a Fluid object.
 *
 * @public
 */
export type FluidObjectId = string;

/**
 * The kind of {@link VisualNodeBase}.
 *
 * @remarks Can be used to type-switch on the particular kind of node being processed.
 *
 * @public
 */
export enum VisualNodeKind {
	FluidTreeNode,
	FluidValueNode,
	FluidHandleNode,
	FluidUnknownNode,
	TreeNode,
	ValueNode,
	UnknownData,
}

/**
 * Type union representing TypeScript primitives.
 *
 * @remarks Used for data / metadata in {@link VisualNodeBase}s.
 *
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type Primitive = bigint | number | boolean | null | string | symbol | undefined;

/**
 * Base interface for all {@link VisualNode}s.
 *
 * @public
 */
export interface VisualNodeBase {
	/**
	 * Label text used as the item name in the visual tree.
	 */
	label: string;

	/**
	 * (optional) Metadata describing the type of the item, to be displayed inline.
	 */
	typeMetadata?: string;

	/**
	 * (optional) Additional metadata to be displayed inline.
	 */
	metadata?: Record<string, Primitive>;

	/**
	 * {@inheritDoc VisualNodeKind}
	 */
	nodeKind: VisualNodeKind;
}

/**
 * Base interface for visual leaf nodes containing an inline value.
 *
 * @public
 */
export interface ValueNodeBase extends VisualNodeBase {
	/**
	 * The value to display inline.
	 */
	value: Primitive;
}

/**
 * A visual tree with children, which should be displayed beneath this item in the visual tree.
 *
 * @public
 */
export interface VisualTreeNode extends VisualNodeBase {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: FluidObjectChildNode[];

	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.TreeNode;
}

/**
 * Terminal node containing a simple value to display.
 *
 * @public
 */
export interface VisualValueNode extends ValueNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.ValueNode;
}

/**
 * Terminal node indicating that the data associated with the {@link VisualNodeBase.label} is not in a form
 * the debugger recognizes.
 *
 * @remarks I.e. it is not a {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * @public
 */
export interface UnknownDataNode extends VisualNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.UnknownData;
}

/**
 * Base interface for nodes referencing Fluid objects.
 *
 * @public
 */
export interface FluidObjectNodeBase extends VisualNodeBase {
	/**
	 * A unique ID for the Fluid object being displayed.
	 */
	fluidObjectId: FluidObjectId;
}

/**
 * Node describing a Fluid object with visual children.
 *
 * @example
 *
 * A DDS like {@link @fluidframework/map#SharedMap}, which stores a series of "child" entries might use this
 * to display each of its entries nested under it.
 *
 * @public
 */
export interface FluidObjectTreeNode extends FluidObjectNodeBase {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: FluidObjectChildNode[];

	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.FluidTreeNode;
}

/**
 * Node describing a Fluid object with a simple value (no children).
 *
 * @example
 *
 * A DDS like {@link @fluidframework/counter#SharedCounter}, which strictly stores a simple primitive value might use
 * this to inline its value (rather than creating unnecessary visual nesting).
 *
 * @public
 */
export interface FluidObjectValueNode extends ValueNodeBase, FluidObjectNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.FluidValueNode;
}

/**
 * A special node, which indicates that the associated Fluid object is of a type we don't recognize and cannot render.
 *
 * @remarks Allows consumers to add special handling for unknown data.
 *
 * @public
 */
export interface FluidUnknownObjectNode extends FluidObjectNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.FluidUnknownNode;
}

/**
 * Node pointing to another Fluid object via a unique identifier.
 *
 * @public
 */
export interface FluidHandleNode extends VisualNodeBase {
	/**
	 * A unique ID for the Fluid object being referenced.
	 *
	 * @remarks Consumers will need to request a {@link FluidObjectTreeNode | visual tree} for this item separately.
	 */
	fluidObjectId: string;

	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.FluidHandleNode;
}

/**
 * A node in a visual metadata tree.
 *
 * @public
 */
export type VisualNode =
	| VisualTreeNode
	| VisualValueNode
	| FluidHandleNode
	| FluidObjectTreeNode
	| FluidObjectValueNode
	| FluidUnknownObjectNode
	| UnknownDataNode;

/**
 * A visual tree describing a Fluid object.
 *
 * @public
 */
export type FluidObjectNode = FluidObjectTreeNode | FluidObjectValueNode | FluidUnknownObjectNode;

/**
 * A visual tree that can be the child of a {@link FluidObjectNodeBase}.
 *
 * @public
 */
export type FluidObjectChildNode =
	| VisualTreeNode
	| VisualValueNode
	| FluidHandleNode
	| UnknownDataNode;

/**
 * Creates a {@link FluidHandleNode} from the provided ID and label.
 */
export function createHandleNode(id: FluidObjectId, label: string): FluidHandleNode {
	return {
		label,
		fluidObjectId: id,
		typeMetadata: "Fluid Handle",
		nodeKind: VisualNodeKind.FluidHandleNode,
	};
}

/**
 * Creates a {@link UnknownDataNode} with the provided label.
 */
export function createUnknownDataNode(label: string): UnknownDataNode {
	return {
		label,
		nodeKind: VisualNodeKind.UnknownData,
	};
}
