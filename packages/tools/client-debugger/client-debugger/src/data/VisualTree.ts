/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains a type system for describing visual descriptors of data objects in a serializable
 * tree format that can be broadcast by the debugger for external tools to consume.
 */

/**
 * The kind of {@link VisualTreeNodeBase}.
 * 
 * @remarks Can be used to type-switch on the particular kind of node being processed.
 */
export enum NodeKind {
	ParentNode,
	FluidTreeNode,
	FluidValueNode,
	FluidHandleNode,
	DataNode,
}

/**
 * Base interface for all visual tree nodes.
 */
export interface VisualTreeNodeBase {
	/**
	 * Label text used as the item name in the visual tree.
	 */
	label: string;
	
	/**
	 * Metadata describing the type of the item, to be displayed inline.
	 */
	typeMetadata: string;
	
	/**
	 * (optional) Additional metadata to be displayed inline.
	 */
	metaData?: string; // information of the value

	/**
	 * {@inheritDoc NodeKind}
	 */
	nodeType: NodeKind;
}

/**
 * Base interface for nodes that have children, which should be displayed beneath this item in the visual tree.
 */
export interface VisualParentNode extends VisualTreeNodeBase {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: VisualTreeNode[];
	
	/**
	 * {@inheritDoc VisualNodeBase.nodeType}
	 */
	nodeType: NodeKind.ParentNode;
}

/**
 * Base interface for nodes referencing Fluid objects
 */
export interface FluidObjectNode extends VisualTreeNodeBase {
	/**
	 * A unique ID for the Fluid object being displayed.
	 */
	fluidObjectId: string;
}

/**
 * Node describing a Fluid object with visual children
 */
export interface FluidObjectTreeNode extends FluidObjectNode {
	/**
	 * Child items to be displayed beneath this node.
	 */
	children: VisualTreeNode[];	
	
	/**
	 * {@inheritDoc VisualNodeBase.nodeType}
	 */
	nodeType: NodeKind.FluidTreeNode;
}

/**
 * Node describing a Fluid object with a simple value (no children)
 *
 * E.g.
 */
export interface FluidObjectValueNode extends FluidObjectNode {
	/**
	 * The value of the Fluid object to be displayed inline.
	 */
	value: string;	

	/**
	 * {@inheritDoc VisualNodeBase.nodeType}
	 */
	nodeType: NodeKind.FluidValueNode;
}

/**
 * Node pointing to another Fluid object via a unique identifier.
 */
export interface FluidHandleNode extends VisualTreeNodeBase {
	/**
	 * A unique ID for the Fluid object being referenced.
	 * 
	 * @remarks Consumers will need to request a {@link FluidObjectTreeNode | visual tree} for this item separately.
	 */
	fluidObjectId: string;	
	
	/**
	 * {@inheritDoc VisualNodeBase.nodeType}
	 */
	nodeType: NodeKind.FluidHandleNode;
}

/**
 * Terminal node containing a simple value to display.
 */
interface ValueNode extends VisualTreeNodeBase {
	/**
	 * The value to display inline.
	 */
	value: string;	
	
	/**
	 * {@inheritDoc VisualNodeBase.nodeType}
	 */
	nodeType: NodeKind.DataNode;
}

/**
 * Describes a visual tree to be displayed.
 */
export type VisualTreeNode = VisualParentNode | ValueNode | FluidHandleNode;
