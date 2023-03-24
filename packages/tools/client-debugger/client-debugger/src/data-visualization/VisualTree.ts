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
 * @internal
 */
export type FluidObjectId = string;

/**
 * The kind of {@link VisualTreeNodeBase}.
 *
 * @remarks Can be used to type-switch on the particular kind of node being processed.
 *
 * @internal
 */
export enum NodeKind {
	ParentNode,
	FluidTreeNode,
	FluidValueNode,
	FluidHandleNode,
	ValueNode,
}

/**
 * Base interface for all visual tree nodes.
 *
 * @internal
 */
export interface VisualTreeNodeBase {
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
	metadata?: string;

	/**
	 * {@inheritDoc NodeKind}
	 */
	nodeKind: NodeKind;
}

/**
 * Base interface for nodes that have children, which should be displayed beneath this item in the visual tree.
 *
 * @internal
 */
export interface VisualParentNode extends VisualTreeNodeBase {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: VisualTreeNode[];

	/**
	 * {@inheritDoc VisualTreeNodeBase.nodeKind}
	 */
	nodeKind: NodeKind.ParentNode;
}

/**
 * Base interface for nodes referencing Fluid objects.
 *
 * @internal
 */
export interface FluidObjectNode extends VisualTreeNodeBase {
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
 * @internal
 */
export interface FluidObjectTreeNode extends FluidObjectNode {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: VisualTreeNode[];

	/**
	 * {@inheritDoc VisualTreeNodeBase.nodeKind}
	 */
	nodeKind: NodeKind.FluidTreeNode;
}

/**
 * Node describing a Fluid object with a simple value (no children).
 *
 * @example
 *
 * A DDS like {@link @fluidframework/counter#SharedCounter}, which strictly stores a simple primitive value might use
 * this to inline its value (rather than creating unnecessary visual nesting).
 *
 * @internal
 */
export interface FluidObjectValueNode extends FluidObjectNode {
	/**
	 * The value of the Fluid object to be displayed inline.
	 */
	value: string;

	/**
	 * {@inheritDoc VisualTreeNodeBase.nodeKind}
	 */
	nodeKind: NodeKind.FluidValueNode;
}

/**
 * Node pointing to another Fluid object via a unique identifier.
 *
 * @internal
 */
export interface FluidHandleNode extends VisualTreeNodeBase {
	/**
	 * A unique ID for the Fluid object being referenced.
	 *
	 * @remarks Consumers will need to request a {@link FluidObjectTreeNode | visual tree} for this item separately.
	 */
	fluidObjectId: string;

	/**
	 * {@inheritDoc VisualTreeNodeBase.nodeKind}
	 */
	nodeKind: NodeKind.FluidHandleNode;
}

/**
 * Terminal node containing a simple value to display.
 *
 * @internal
 */
export interface ValueNode extends VisualTreeNodeBase {
	/**
	 * The value to display inline.
	 */
	value: string;

	/**
	 * {@inheritDoc VisualTreeNodeBase.nodeKind}
	 */
	nodeKind: NodeKind.ValueNode;
}

/**
 * Describes a visual tree to be displayed.
 *
 * @internal
 */
export type VisualTreeNode = VisualParentNode | ValueNode | FluidHandleNode;

/**
 * Creates a {@link FluidHandleNode} from the provided ID and label.
 */
export function createHandleNode(id: FluidObjectId, label: string): FluidHandleNode {
	return {
		label,
		fluidObjectId: id,
		typeMetadata: "Fluid Handle",
		nodeKind: NodeKind.FluidHandleNode,
	};
}
