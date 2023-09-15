/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
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
	TreeSchemaBuilder,
	TreeStoredSchema,
	TreeSchemaIdentifier,
	treeSchema,
	IForestSubscription,
	mapCursorField,
} from "../core";
import { FieldKinds, jsonableTreeFromCursor, singleTextCursor } from "../feature-libraries";
import { Named, brand } from "../util";
import { SharedTree, ISharedTreeView, SharedTreeFactory, ISharedTree } from "../shared-tree";
import { typeboxValidator } from "../external-utilities";

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

export const treeOnCreate = (tree: SharedTree) => {
	tree.storedSchema.update(testSchema);
	const field = tree.view.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.insert(0, singleTextCursor(initialTreeState));
};

export function validateAnchors(
	tree: ISharedTreeView,
	anchors: ReadonlyMap<Anchor, [UpPath, Value]>,
	checkPaths: boolean,
) {
	for (const [anchor, [path, value]] of anchors) {
		const cursor = tree.forest.allocateCursor();
		tree.forest.tryMoveCursorToNode(anchor, cursor);
		assert(cursor.value === value, "cursor value must match the anchor value.");
		if (checkPaths) {
			const actualPath = tree.locate(anchor);
			assert(compareUpPaths(actualPath, path), "the path must match the anchor path.");
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
		assert(path !== undefined, "path must be defined");
		return anchors.set(anchor, [clonePath(path), c.value]);
	});
	cursor.free();
	return anchors;
}

/**
 * Helper for building {@link Named} {@link TreeStoredSchema} without using {@link SchemaBuilder}.
 */
export function namedTreeSchema(
	data: TreeSchemaBuilder & Named<string>,
): Named<TreeSchemaIdentifier> & TreeStoredSchema {
	return {
		name: brand(data.name),
		...treeSchema({ ...data }),
	};
}

export function toJsonableTree(tree: ISharedTreeView): JsonableTree[] {
	return jsonableTreeFromForest(tree.forest);
}

export function jsonableTreeFromForest(forest: IForestSubscription): JsonableTree[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const jsonable = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	return jsonable;
}

/**
 * A test helper that allows custom code to be injected when a tree is created/loaded.
 */
export class SharedTreeTestFactory extends SharedTreeFactory {
	/**
	 * @param onCreate - Called once for each created tree (not called for trees loaded from summaries).
	 * @param onLoad - Called once for each tree that is loaded from a summary.
	 */
	public constructor(
		private readonly onCreate: (tree: SharedTree) => void,
		private readonly onLoad?: (tree: SharedTree) => void,
	) {
		super({ jsonValidator: typeboxValidator });
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = (await super.load(runtime, id, services, channelAttributes)) as SharedTree;
		this.onLoad?.(tree);
		return tree;
	}

	public override create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = super.create(runtime, id) as SharedTree;
		this.onCreate(tree);
		return tree;
	}
}
