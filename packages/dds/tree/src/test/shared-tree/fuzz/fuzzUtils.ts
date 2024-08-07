/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { join as pathJoin } from "path";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import type { FuzzSerializedIdCompressor } from "@fluid-private/test-dds-utils";
import type { SessionId } from "@fluidframework/id-compressor";
import {
	createIdCompressor,
	deserializeIdCompressor,
} from "@fluidframework/id-compressor/internal";

import {
	type Anchor,
	type Revertible,
	TreeNavigationResult,
	type UpPath,
	type Value,
	clonePath,
	forEachNodeInSubtree,
	moveToDetachedField,
} from "../../../core/index.js";
import { intoStoredSchema } from "../../../feature-libraries/index.js";
import type { ITreeCheckout, SharedTree } from "../../../shared-tree/index.js";
import { testSrcPath } from "../../testSrcPath.cjs";
import { expectEqualPaths } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../../simple-tree/schemaFactory.js";
import type {
	NodeBuilderData,
	TreeNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/schemaTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../../simple-tree/toFlexSchema.js";
import type {
	ValidateRecursiveSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/schemaFactoryRecursive.js";

const builder = new SchemaFactory("treeFuzz");
export class GUIDNode extends builder.object("GuidNode", {
	value: builder.optional(builder.string),
}) {}

export class FuzzStringNode extends builder.object("FuzzStringNode", {
	stringValue: builder.required(builder.string),
}) {}
export class FuzzNumberNode extends builder.object("FuzzNumberNode", {
	value: builder.required(builder.number),
}) {}
export class FuzzHandleNode extends builder.object("FuzzHandleNode", {
	value: builder.required(builder.handle),
}) {}

export type InitialAllowedFuzzTypes =
	| FuzzStringNode
	| FuzzNumberNode
	| FuzzHandleNode
	| GUIDNode
	| FuzzNode;

const initialAllowedTypes = [
	FuzzStringNode,
	FuzzNumberNode,
	FuzzHandleNode,
	GUIDNode,
	() => FuzzNode,
] as const;

export class SequenceChildren extends builder.arrayRecursive(
	"sequenceChildren",
	initialAllowedTypes,
) {}

type _checkSequenceChildren = ValidateRecursiveSchema<typeof SequenceChildren>;

/**
 * We use a more flexible set of allowed types to help during compile time, but during a fuzz test's runtime,
 * different trees will have different views over the currently allowed schema.
 * This extremely permissive schema is a valid superset over all possible schema and is a reasonable type to use at compile time,
 * but generators/reducers working with trees over the course of a fuzz test need to be careful
 * to appropriately narrow their edits to be valid for the tree's current schema at runtime.
 *
 * During the fuzz test, {@link SchemaChange} can be generated which extends the allowed node types (with the node type being a generated uuid)
 * for each of our fields in our tree's current schema.
 */
export class FuzzNode extends builder.objectRecursive("node", {
	optionalChild: builder.optionalRecursive(initialAllowedTypes),
	requiredChild: builder.requiredRecursive(initialAllowedTypes),
	sequenceChildren: SequenceChildren,
}) {}
type _checkFuzzNode = ValidateRecursiveSchema<typeof FuzzNode>;

export type FuzzNodeSchema = typeof FuzzNode;

export const initialFuzzSchema = createTreeViewSchema([]);
export const fuzzFieldSchema = FuzzNode.info.optionalChild;

export function createFuzzNodeSchema(
	nodeTypes: TreeNodeSchema[],
	schemaFactory: SchemaFactory<"treeFuzz">,
): FuzzNodeSchema {
	class SequenceChildren2 extends schemaFactory.arrayRecursive("sequenceChildren", [
		() => Node,
		FuzzStringNode,
		FuzzNumberNode,
		FuzzHandleNode,
		...nodeTypes,
	]) {}
	class Node extends schemaFactory.objectRecursive("node", {
		requiredChild: [() => Node, FuzzStringNode, FuzzNumberNode, FuzzHandleNode, ...nodeTypes],
		optionalChild: schemaFactory.optionalRecursive([
			() => Node,
			FuzzStringNode,
			FuzzNumberNode,
			FuzzHandleNode,
			...nodeTypes,
		]),
		sequenceChildren: SequenceChildren2,
	}) {}

	type _check = ValidateRecursiveSchema<typeof Node>;
	return Node as unknown as FuzzNodeSchema;
}

export function createTreeViewSchema(allowedTypes: TreeNodeSchema[]): typeof fuzzFieldSchema {
	const schemaFactory = new SchemaFactory("treeFuzz");
	const node = createFuzzNodeSchema(allowedTypes, schemaFactory).info.optionalChild;
	return node as unknown as typeof fuzzFieldSchema;
}

export const onCreate = (tree: SharedTree) => {
	tree.checkout.updateSchema(intoStoredSchema(toFlexSchema(initialFuzzSchema)));
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

export const failureDirectory = pathJoin(testSrcPath, "shared-tree/fuzz/failures");
export const successesDirectory = pathJoin(testSrcPath, "shared-tree/fuzz/successes");

export const createOrDeserializeCompressor = (
	sessionId: SessionId,
	summary?: FuzzSerializedIdCompressor,
) => {
	return summary === undefined
		? createIdCompressor(sessionId)
		: summary.withSession
			? deserializeIdCompressor(summary.serializedCompressor)
			: deserializeIdCompressor(summary.serializedCompressor, sessionId);
};

export const deterministicIdCompressorFactory: (
	seed: number,
) => (summary?: FuzzSerializedIdCompressor) => ReturnType<typeof createIdCompressor> = (
	seed,
) => {
	const random = makeRandom(seed);
	return (summary?: FuzzSerializedIdCompressor) => {
		const sessionId = random.uuid4() as SessionId;
		return createOrDeserializeCompressor(sessionId, summary);
	};
};

export const populatedInitialState: NodeBuilderData<typeof FuzzNode> = {
	sequenceChildren: [
		{
			sequenceChildren: [{ stringValue: "AA" }, { stringValue: "AB" }, { stringValue: "AC" }],
			requiredChild: { stringValue: "A" },
		},
		{
			sequenceChildren: [{ stringValue: "BA" }, { stringValue: "BB" }, { stringValue: "BC" }],
			requiredChild: { stringValue: "B" },
		},
		{
			sequenceChildren: [{ stringValue: "CA" }, { stringValue: "CB" }, { stringValue: "CC" }],
			requiredChild: { stringValue: "C" },
		},
	],
	requiredChild: { stringValue: "R" },
} as unknown as NodeBuilderData<typeof FuzzNode>;
