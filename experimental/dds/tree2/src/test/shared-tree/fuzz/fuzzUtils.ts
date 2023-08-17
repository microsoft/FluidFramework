/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	JsonableTree,
	fieldSchema,
	SchemaData,
	rootFieldKey,
	moveToDetachedField,
	Anchor,
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

export function getFirstAnchor(tree: ISharedTree): Anchor {
	// building the anchor for anchor stability test
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.getPath();
	cursor.firstField();
	cursor.getFieldKey();
	cursor.enterNode(1);
	const anchor = cursor.buildAnchor();
	cursor.free();
	return anchor;
}
