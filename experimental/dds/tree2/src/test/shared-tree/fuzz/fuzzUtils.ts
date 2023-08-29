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
import { FieldKinds, singleTextCursor } from "../../../feature-libraries";
import { brand } from "../../../util";
import { ISharedTree } from "../../../shared-tree";
import { namedTreeSchema } from "../../utils";

export const initialTreeState: JsonableTree = {
	type: brand("Node"),
	fields: {
		foo: [
			{ type: brand("Number"), value: 0 },
			{ type: brand("Number"), value: 1 },
			{ type: brand("Number"), value: 2 },
		],
		foo2: [
			{ type: brand("Number"), value: 3 },
			{ type: brand("Number"), value: 4 },
			{ type: brand("Number"), value: 5 },
		],
	},
};

const rootFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: "TestValue",
	mapFields: fieldSchema(FieldKinds.sequence),
});

export const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	rootFieldSchema,
};

export const onCreate = (tree: ISharedTree) => {
	tree.storedSchema.update(testSchema);
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.insert(0, singleTextCursor(initialTreeState));
};

export function validateAnchors(
	tree: ISharedTree,
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

export function createAnchors(tree: ISharedTree): Map<Anchor, [UpPath, Value]> {
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
