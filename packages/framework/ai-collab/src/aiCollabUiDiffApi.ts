/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The following interfaces are intended to be used to visualize the changes made to a SharedTree (as a result of using ai-collab) on a UI.

/**
 * A base interface to enforce consistency between all Diff objects.
 * @remarks This object is not intended to be used directly.
 * The union type Diff provides a better typescript experience
 *
 * @alpha
 */
export interface DiffBase {
	/**
	 * The operation type performed by an ai agent on a SharedTree
	 * @remarks This is intended to be used to correlate the diff with the operation that generated it.
	 */
	readonly type: string;
	/**
	 * An explanation from the ai as to why the edit is being made.
	 */
	readonly aiExplanation: string;
}

/**
 * An object that provides relevant information to visualize a single edit performed by an ai agent on a SharedTree
 * @alpha
 */
export type Diff = InsertDiff | ModifyDiff | RemoveDiff | MoveDiff;

/**
 * A path from the root of the tree node passed to ai-collab to a specific node within the tree.
 * @alpha
 */
export type NodePath = {
	/**
	 * The short id of the node.
	 * @remarks the root tree node and nodes without a defined SchemaFactory.identifier field will not have a short id.
	 */
	shortId: string | number | undefined;
	/**
	 * The schema of the node.
	 */
	schemaIdentifier: string;
	/**
	 * The field within the parent node that the node is located at.
	 * @remarks
	 * The root node will have a parentField name of 'rootFieldKey'.
	 * Nodes in an array use numbers to represent their index within the array.
	 */
	parentField: string | number;
}[];

/**
 * An object that describes the insertion of a new node into a tree.
 * @remarks This object is intended to be used to visualize the changes made to a tree on a UI.
 * @alpha
 */
export interface InsertDiff extends DiffBase {
	type: "insert";
	/**
	 * The path from the root node to the newly inserted node.
	 * The last value in the path will be the newly inserted node.
	 * If the newly inserted node is a primitive value, the last value in the path will be the parent array node.
	 */
	nodePath: NodePath;
	/**
	 * The content of the newly inserted node.
	 */
	nodeContent: unknown;
}

/**
 * An object that describes the modification of an existing node on a tree.
 * @remarks This object is intended to be used to visualize the changes made to a tree on a UI.
 * @alpha
 */
export interface ModifyDiff extends DiffBase {
	type: "modify";
	/**
	 * The path from the root node to the ndoe being modified.
	 */
	nodePath: NodePath;
	/**
	 * The new value of the node.
	 */
	newValue: unknown;
	/**
	 * The old value of the node.
	 */
	oldValue: unknown;
}

/**
 * An object that describes the removal of a node from a tree.
 * @alpha
 */
export type RemoveDiff = RemoveFieldDiff | ArraySingleRemoveDiff | ArrayRangeRemoveDiff;

/**
 * An object that describes a field being removed from a SharedTree.
 * @alpha
 */
export interface RemoveFieldDiff extends DiffBase {
	type: "remove";
	subType: "remove-field";
	/**
	 * The path from the root of the tree to the node being removed.
	 */
	nodePath: NodePath;
	/**
	 * The content of the node being removed.
	 */
	nodeContent: unknown;
}

/**
 * An object that describes the removal of a single node from an array node.
 * @alpha
 */
export interface ArraySingleRemoveDiff extends DiffBase {
	type: "remove";
	subType: "remove-array-single";
	/**
	 * The path from the root of the tree to the node being removed from the array node.
	 */
	nodePath: NodePath;
	/**
	 * The content of the node being removed from the array node.
	 */
	nodeContent: unknown;
}

/**
 * An object that describes the removal of a range of nodes from an array node.
 * @alpha
 */
export interface ArrayRangeRemoveDiff extends DiffBase {
	type: "remove";
	subType: "remove-array-range";
	/**
	 * The paths to each node being removed from the array node.
	 */
	nodePaths: NodePath[];
	/**
	 * The content of each of the nodes being removed from the array node.
	 */
	nodeContents: unknown[];
}

/**
 * An object that describes the movement of nodes from one array node to another array node.
 * @alpha
 */
export type MoveDiff = MoveSingleDiff | MoveRangeDiff;

/**
 * An object that describes the movement of a single node from one array node to another array node.
 * @alpha
 */
export interface MoveSingleDiff extends DiffBase {
	type: "move";
	subType: "move-single";
	/**
	 * The path from the root of the tree to the source node.
	 * The last value in the path will be the node being moved
	 */
	sourceNodePath: NodePath;
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	destinationNodePath: NodePath;
	/**
	 * The content of the node being moved from the source array node to the destination array node.
	 */
	nodeContent: unknown;
}

/**
 * An object that describes the movement of a range of nodes from one array node to another array node.
 * @alpha
 */
export interface MoveRangeDiff extends DiffBase {
	type: "move";
	subType: "move-range";
	/**
	 * The paths to each node being moved from the source array node.
	 */
	sourceNodePaths: NodePath[];
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	destinationNodePath: NodePath;
	/**
	 * The content of each of the nodes being moved from the source array node to the destination array node.
	 */
	nodeContents: unknown[];
}
