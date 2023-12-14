/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { join as pathJoin } from "path";
import {
	moveToDetachedField,
	Anchor,
	UpPath,
	Value,
	clonePath,
	forEachNodeInSubtree,
	Revertible,
	TreeNavigationResult,
} from "../../../core";
import {
	FieldKinds,
	TreeFieldSchema,
	FlexTreeObjectNodeTyped,
	intoStoredSchema,
} from "../../../feature-libraries";
import { SharedTree, ITreeCheckout } from "../../../shared-tree";
import { SchemaBuilder, leaf } from "../../../domains";
import { expectEqualPaths } from "../../utils";

const builder = new SchemaBuilder({ scope: "tree2fuzz", libraries: [leaf.library] });
export const fuzzNode = builder.objectRecursive("node", {
	requiredChild: TreeFieldSchema.createUnsafe(FieldKinds.required, [
		() => fuzzNode,
		...leaf.primitives,
	]),
	optionalChild: TreeFieldSchema.createUnsafe(FieldKinds.optional, [
		() => fuzzNode,
		...leaf.primitives,
	]),
	sequenceChildren: TreeFieldSchema.createUnsafe(FieldKinds.sequence, [
		() => fuzzNode,
		...leaf.primitives,
	]),
});

export type FuzzNodeSchema = typeof fuzzNode;

export type FuzzNode = FlexTreeObjectNodeTyped<FuzzNodeSchema>;

export const fuzzSchema = builder.intoSchema(fuzzNode.objectNodeFieldsObject.optionalChild);

export const onCreate = (tree: SharedTree) => {
	tree.storedSchema.update(intoStoredSchema(fuzzSchema));
};

/**
 * Asserts that each anchor in `anchors` points to a node in `view` holding the provided value.
 * If `checkPaths` is provided, also asserts the located node has the provided path.
 */
export function validateAnchors(
	view: ITreeCheckout,
	anchors: ReadonlyMap<Anchor, [UpPath, Value]>,
	checkPaths: boolean,
) {
	const cursor = view.forest.allocateCursor();
	for (const [anchor, [path, value]] of anchors) {
		const result = view.forest.tryMoveCursorToNode(anchor, cursor);
		assert.equal(result, TreeNavigationResult.Ok);
		assert.equal(cursor.value, value);
		if (checkPaths) {
			const actualPath = view.locate(anchor);
			expectEqualPaths(actualPath, path);
		}
	}
	cursor.free();
}

export function createAnchors(tree: ITreeCheckout): Map<Anchor, [UpPath, Value]> {
	const anchors: Map<Anchor, [UpPath, Value]> = new Map();
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	forEachNodeInSubtree(cursor, (c) => {
		const anchor = c.buildAnchor();
		const path = tree.locate(anchor);
		assert(path !== undefined);
		return anchors.set(anchor, [clonePath(path), c.value]);
	});
	cursor.free();
	return anchors;
}

export type RevertibleSharedTreeView = ITreeCheckout & {
	undoStack: Revertible[];
	redoStack: Revertible[];
	unsubscribe: () => void;
};

export function isRevertibleSharedTreeView(s: ITreeCheckout): s is RevertibleSharedTreeView {
	return (s as RevertibleSharedTreeView).undoStack !== undefined;
}

export const failureDirectory = pathJoin(
	__dirname,
	"../../../../src/test/shared-tree/fuzz/failures",
);
