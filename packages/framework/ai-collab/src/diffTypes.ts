/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The following interfaces represent diffs resulting from edits made to the SharedTree by the AI agent.

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
	readonly shortId: string | number | undefined;
	/**
	 * The schema of the node.
	 */
	readonly schemaIdentifier: string;
	/**
	 * The field within the parent node that the node is located at.
	 * @remarks
	 * The root node will have a parentField name of 'rootFieldKey'.
	 * Nodes in an array use numbers to represent their index within the array.
	 */
	readonly parentField: string | number;
}[];

/**
 * An object that describes the insertion of a new node into a tree.
 * @alpha
 */
export interface InsertDiff extends DiffBase {
	readonly type: "insert";
	/**
	 * The path from the root node to the newly inserted node.
	 * The last value in the path will be the newly inserted node.
	 * If the newly inserted node is a primitive value, the last value in the path will be the parent array node.
	 */
	readonly nodePath: NodePath;
	/**
	 * The content of the newly inserted node.
	 */
	readonly nodeContent: unknown;
}

/**
 * An object that describes the modification of an existing node on a tree.
 * @alpha
 */
export interface ModifyDiff extends DiffBase {
	readonly type: "modify";
	/**
	 * The path from the root node to the ndoe being modified.
	 */
	readonly nodePath: NodePath;
	/**
	 * The new value of the node.
	 */
	readonly newValue: unknown;
	/**
	 * The old value of the node.
	 */
	readonly oldValue: unknown;
}

/**
 * An object that describes the removal of one or more nodes from a tree.
 * @alpha
 */
export type RemoveDiff = RemoveNodeDiff | ArraySingleRemoveDiff | ArrayRangeRemoveDiff;

/**
 * An object that describes a field being removed from a SharedTree.
 * @alpha
 */
export interface RemoveNodeDiff extends DiffBase {
	readonly type: "remove";
	/**
	 * The type of removal being performed.
	 */
	readonly removalType: "remove-field";
	/**
	 * The path from the root of the tree to the node being removed.
	 */
	readonly nodePath: NodePath;
	/**
	 * The content of the node being removed.
	 */
	readonly nodeContent: unknown;
}

/**
 * An object that describes the removal of a single node from an array node.
 * @alpha
 */
export interface ArraySingleRemoveDiff extends DiffBase {
	readonly type: "remove";
	/**
	 * The type of removal being performed.
	 */
	readonly removalType: "remove-array-single";
	/**
	 * The path from the root of the tree to the node being removed from the array node.
	 */
	readonly nodePath: NodePath;
	/**
	 * The content of the node being removed from the array node.
	 */
	readonly nodeContent: unknown;
}

/**
 * An object that describes the removal of a range of nodes from an array node.
 * @alpha
 */
export interface ArrayRangeRemoveDiff extends DiffBase {
	readonly type: "remove";
	/**
	 * The type of removal being performed.
	 */
	readonly removalType: "remove-array-range";
	/**
	 * The paths to each node being removed from the array node.
	 */
	readonly nodePaths: NodePath[];
	/**
	 * The content of each of the nodes being removed from the array node.
	 */
	readonly nodeContents: unknown[];
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
	readonly type: "move";
	/**
	 * The type of movement being performed.
	 */
	readonly moveType: "move-single";
	/**
	 * The path from the root of the tree to the source node.
	 * The last value in the path will be the node being moved
	 */
	readonly sourceNodePath: NodePath;
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	readonly destinationNodePath: NodePath;
	/**
	 * The content of the node being moved from the source array node to the destination array node.
	 */
	readonly nodeContent: unknown;
}

/**
 * An object that describes the movement of a range of nodes from one array node to another array node.
 * @alpha
 */
export interface MoveRangeDiff extends DiffBase {
	readonly type: "move";
	/**
	 * The type of movement being performed.
	 */
	readonly moveType: "move-range";
	/**
	 * The paths to each node being moved from the source array node.
	 */
	readonly sourceNodePaths: NodePath[];
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	readonly destinationNodePath: NodePath;
	/**
	 * The content of each of the nodes being moved from the source array node to the destination array node.
	 */
	readonly nodeContents: unknown[];
}
