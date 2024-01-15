/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FluidObjectId, type EditType } from "../CommonInterfaces";

/**
 * This module contains a type system for describing visual descriptors of data objects in a serializable
 * tree format that can be broadcast by the devtools for external tools to consume.
 */

/**
 * The kind of {@link VisualNodeBase}.
 *
 * @remarks
 *
 * Can be used to type-switch on the particular kind of node being processed.
 *
 * Note: for forwards compatability reasons, consumers of this should not assume it is exhaustive.
 * I.e. consumers should gracefully handle the case where
 *
 * @internal
 */
export enum VisualNodeKind {
	FluidTreeNode = "FluidTreeNode",
	FluidValueNode = "FluidValueNode",
	FluidHandleNode = "FluidHandleNode",
	FluidUnknownObjectNode = "FluidUnknownObjectNode",
	TreeNode = "TreeNode",
	ValueNode = "ValueNode",
	UnknownObjectNode = "UnknownObjectNode",
}

/**
 * Type union representing TypeScript primitives supported in DDSes.
 *
 * @remarks Used for data / metadata in {@link VisualNodeBase}s.
 *
 * @internal
 */
// eslint-disable-next-line @rushstack/no-new-null
export type Primitive = number | boolean | null | string | undefined;

/**
 * Base interface for all {@link VisualNode}s.
 *
 * @internal
 */
export interface VisualNodeBase {
	/**
	 * (optional) Metadata describing the type of the item, to be displayed inline.
	 */
	typeMetadata?: string;

	/**
	 * (optional) Additional metadata to be displayed inline.
	 */
	metadata?: Record<string, Primitive>;

	/**
	 * The "kind" of tree node.
	 *
	 * @remarks
	 *
	 * This will generally be {@link VisualNodeKind}, but for forwards/backwards compatability reasons,
	 * we allow this to be an arbitrary string.
	 * Consumers of this value should attempt to handle unrecognized values gracefully.
	 */
	nodeKind: VisualNodeKind | string;

	/**
	 * (optional) If editProps is present it indicates the node is editable.
	 * Inside of the porperty is an array of possible EditTypes to inform devtools-view to only show the corresponding edit options for the types allowed
	 */
	editProps?: { editTypes?: EditType[] };
}

/**
 * Base interface for visual leaf nodes containing an inline value.
 *
 * @internal
 */
export interface ValueNodeBase extends VisualNodeBase {
	/**
	 * The value to display inline.
	 */
	value: Primitive;
}

/**
 * Base interface for visual parent nodes containing child nodes.
 *
 * @internal
 */
export interface TreeNodeBase extends VisualNodeBase {
	/**
	 * Child items to be displayed beneath this node, keyed by some associated label
	 * (e.g. map key, property name, etc.).
	 */
	children: Record<string, VisualChildNode>;
}

/**
 * A visual tree with children, which should be displayed beneath this item in the visual tree.
 *
 * @internal
 */
export interface VisualTreeNode extends TreeNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.TreeNode;
}

/**
 * Terminal node containing a simple value to display.
 *
 * @internal
 */
export interface VisualValueNode extends ValueNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.ValueNode;
}

/**
 * Terminal node indicating the devtools encountered data of a kind it did not recognize.
 *
 * @remarks I.e. it is not a {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * @internal
 */
export interface UnknownObjectNode extends VisualNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.UnknownObjectNode;
}

/**
 * Base interface for nodes referencing Fluid objects.
 *
 * @internal
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
 * @internal
 */
export interface FluidObjectTreeNode extends TreeNodeBase, FluidObjectNodeBase {
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
 * @internal
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
 * @internal
 */
export interface FluidUnknownObjectNode extends FluidObjectNodeBase {
	/**
	 * {@inheritDoc VisualNodeBase.nodeKind}
	 */
	nodeKind: VisualNodeKind.FluidUnknownObjectNode;
}

/**
 * Node pointing to another Fluid object via a unique identifier.
 *
 * @internal
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
 * @internal
 */
export type VisualNode =
	| VisualTreeNode
	| VisualValueNode
	| FluidHandleNode
	| FluidObjectTreeNode
	| FluidObjectValueNode
	| FluidUnknownObjectNode
	| UnknownObjectNode;

/**
 * A visual tree describing a Fluid object.
 *
 * @internal
 */
export type FluidObjectNode = FluidObjectTreeNode | FluidObjectValueNode | FluidUnknownObjectNode;

/**
 * A visual tree that can be the child of a {@link FluidObjectNodeBase}.
 *
 * @internal
 */
export type VisualChildNode =
	| VisualTreeNode
	| VisualValueNode
	| FluidHandleNode
	| UnknownObjectNode;

/**
 * A visual tree node representing a root data object provided to the devtools at initialization time.
 *
 * @internal
 */
export type RootHandleNode = FluidHandleNode | UnknownObjectNode;

/**
 * Creates a {@link FluidHandleNode} from the provided ID and label.
 */
export function createHandleNode(id: FluidObjectId): FluidHandleNode {
	return {
		fluidObjectId: id,
		typeMetadata: "Fluid Handle",
		nodeKind: VisualNodeKind.FluidHandleNode,
	};
}

/**
 * {@link UnknownObjectNode} singleton.
 */
export const unknownObjectNode: UnknownObjectNode = {
	nodeKind: VisualNodeKind.UnknownObjectNode,
};
