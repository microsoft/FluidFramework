/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The following interfaces are intended to be used to visualize the changes made to a SharedTree (as a result of using ai-collab) on a UI.

/**
 * An object that provides relevant information to visualize a single edit performed by an ai agent on a SharedTree
 * @alpha
 */
export interface UiDiff {
	type:
		| "modify"
		| "insert"
		| "remove-field"
		| "remove-array-single"
		| "remove-array-range"
		| "move-single"
		| "move-range";
	/**
	 * An explanation from the ai as to why the edit is being made.
	 */
	aiExplanation: string;
}

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
	 * The root node will have a parentField name of 'rootFieldKey'
	 */
	parentField: string | number;
}[];

/**
 * An object that describes the insertion of a new node into a tree.
 * @remarks This object is intended to be used to visualize the changes made to a tree on a UI.
 * @alpha
 */
export interface InsertDiff extends UiDiff {
	type: "insert";
	/**
	 * The path from the root node to the newly inserted node.
	 * The last value in the path will be the newly inserted node.
	 * If the newly inserted node is a primitive value, the last value in the path will be the parent array node.
	 */
	path: NodePath;
}

/**
 * An object that describes the modification of an existing node on a tree.
 * @remarks This object is intended to be used to visualize the changes made to a tree on a UI.
 * @alpha
 */
export interface ModifyDiff extends UiDiff {
	type: "modify";
	/**
	 * The path from the root node to the ndoe being modified.
	 */
	path: NodePath;
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
export interface RemoveFieldDiff extends UiDiff {
	type: "remove-field";
	/**
	 * The path from the root of the tree to the node being removed.
	 */
	path: NodePath;
}

/**
 * An object that describes the removal of a single node from an array node.
 * @alpha
 */
export interface ArraySingleRemoveDiff extends UiDiff {
	type: "remove-array-single";
	path: NodePath;
}

/**
 * An object that describes the removal of a range of nodes from an array node.
 * @alpha
 */
export interface ArrayRangeRemoveDiff extends UiDiff {
	type: "remove-array-range";
	/**
	 * The paths to each node being removed from the array node.
	 */
	paths: NodePath[];
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
export interface MoveSingleDiff extends UiDiff {
	type: "move-single";
	/**
	 * The path from the root of the tree to the source node.
	 * The last value in the path will be the node being moved
	 */
	sourcePath: NodePath;
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	destinationPath: NodePath;
}

/**
 * An object that describes the movement of a range of nodes from one array node to another array node.
 * @alpha
 */
export interface MoveRangeDiff extends UiDiff {
	type: "move-range";
	/**
	 * The paths to each node being moved from the source array node.
	 */
	sourcePaths: NodePath[];
	/**
	 * The path from the root of the tree to the destination array node.
	 */
	destinationPath: NodePath;
}
