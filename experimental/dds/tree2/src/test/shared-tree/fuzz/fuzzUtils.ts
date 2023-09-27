/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	JsonableTree,
	fieldSchema,
	SchemaData,
	rootFieldKey,
	moveToDetachedField,
	Anchor,
	UpPath,
	Value,
	clonePath,
	compareUpPaths,
	forEachNodeInSubtree,
} from "../../../core";
import { FieldKinds, SchemaBuilder, StructTyped } from "../../../feature-libraries";
import { SharedTree, ISharedTreeView } from "../../../shared-tree";
import * as leaf from "../../../domains/leafDomain";

const builder = new SchemaBuilder("Tree2 Fuzz", {}, leaf.library);
export const fuzzNode = builder.structRecursive("Fuzz node", {
	requiredF: SchemaBuilder.fieldRecursive(FieldKinds.value, () => fuzzNode, ...leaf.primitives),
	optionalF: SchemaBuilder.fieldRecursive(
		FieldKinds.optional,
		() => fuzzNode,
		...leaf.primitives,
	),
	sequenceF: SchemaBuilder.fieldRecursive(
		FieldKinds.sequence,
		() => fuzzNode,
		...leaf.primitives,
	),
});

export type FuzzNodeSchema = typeof fuzzNode;

export type FuzzNode = StructTyped<FuzzNodeSchema>;

export const fuzzSchema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(fuzzNode));

export const onCreate = (tree: SharedTree) => {
	tree.storedSchema.update(fuzzSchema);
};

export function validateAnchors(
	tree: ISharedTreeView,
	anchors: ReadonlyMap<Anchor, [UpPath, Value]>,
	checkPaths: boolean,
) {
	for (const [anchor, [path, value]] of anchors) {
		const cursor = tree.forest.allocateCursor();
		tree.forest.tryMoveCursorToNode(anchor, cursor);
		assert.equal(cursor.value, value);
		if (checkPaths) {
			const actualPath = tree.locate(anchor);
			assert(compareUpPaths(actualPath, path));
		}
		cursor.free();
	}
}

export function createAnchors(tree: ISharedTreeView): Map<Anchor, [UpPath, Value]> {
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
