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
import { SchemaBuilder, leaf, typedJsonCursor } from "../../../domains/index.js";
import {
	Any,
	FieldKinds,
	FlexFieldSchema,
	type FlexTreeObjectNodeTyped,
	type LeafNodeSchema,
	type SchemaLibrary,
	intoStoredSchema,
} from "../../../feature-libraries/index.js";
import type { ITreeCheckout, SharedTree, TreeContent } from "../../../shared-tree/index.js";
import { testSrcPath } from "../../testSrcPath.cjs";
import { expectEqualPaths } from "../../utils.js";

const builder = new SchemaBuilder({ scope: "treefuzz", libraries: [leaf.library] });

/**
 * We use any here to give compile-time flexibility, but during a fuzz test's runtime,
 * different trees will have different views over the currently allowed schema.
 * This extremely permissive schema is a valid superset over all possible schema and is a reasonable type to use at compile time,
 * but generators/reducers working with trees over the course of a fuzz test need to be careful
 * to appropriately narrow their edits to be valid for the tree's current schema at runtime.
 *
 * During the fuzz test, {@link SchemaChange} can be generated which extends the allowed node types (with the node type being a generated uuid)
 * for each of our fields in our tree's current schema.
 */
export const fuzzNode = builder.object("node", {
	optionalChild: FlexFieldSchema.create(FieldKinds.optional, [Any]),
	requiredChild: FlexFieldSchema.create(FieldKinds.required, [Any]),
	sequenceChildren: FlexFieldSchema.create(FieldKinds.sequence, [Any]),
});

export type FuzzNodeSchema = typeof fuzzNode;

export type FuzzNode = FlexTreeObjectNodeTyped<FuzzNodeSchema>;

export const initialFuzzSchema = createTreeViewSchema([], leaf.library);

export const fuzzSchema = builder.intoSchema(fuzzNode.objectNodeFieldsObject.optionalChild);

export function createFuzzNode(
	nodeTypes: LeafNodeSchema[],
	schemaBuilder: SchemaBuilder,
): typeof fuzzNode {
	const node = schemaBuilder.objectRecursive("node", {
		requiredChild: FlexFieldSchema.createUnsafe(FieldKinds.required, [
			() => node,
			leaf.number,
			leaf.string,
			leaf.handle,
			...nodeTypes,
		]),
		optionalChild: FlexFieldSchema.createUnsafe(FieldKinds.optional, [
			() => node,
			leaf.number,
			leaf.string,
			leaf.handle,
			...nodeTypes,
		]),
		sequenceChildren: FlexFieldSchema.createUnsafe(FieldKinds.sequence, [
			() => node,
			leaf.number,
			leaf.string,
			leaf.handle,
			...nodeTypes,
		]),
	});
	return node as unknown as typeof fuzzNode;
}

export function createTreeViewSchema(
	allowedTypes: LeafNodeSchema[],
	schemaLibrary?: SchemaLibrary,
): typeof fuzzSchema {
	const schemaBuilder = new SchemaBuilder({
		scope: "treefuzz",
		libraries: schemaLibrary === undefined ? [leaf.library] : [leaf.library, schemaLibrary],
	});
	const node = createFuzzNode(allowedTypes, schemaBuilder);
	return schemaBuilder.intoSchema(
		node.objectNodeFieldsObject.optionalChild,
	) as unknown as typeof fuzzSchema;
}

export const onCreate = (tree: SharedTree) => {
	tree.checkout.updateSchema(intoStoredSchema(initialFuzzSchema));
};

/**
 * Asserts that each anchor in `anchors` points to a node in `view` holding the provided value.
 * If `checkPaths` is provided, also asserts the located node has the provided path.
 */
export function validateAnchors(
	view: ITreeCheckout,
	anchors: ReadonlyMap<Anchor, [UpPath, Value]>,
	checkPaths: boolean,
	tolerateLostAnchors = true,
) {
	const cursor = view.forest.allocateCursor();
	for (const [anchor, [path, value]] of anchors) {
		const result = view.forest.tryMoveCursorToNode(anchor, cursor);
		if (tolerateLostAnchors && result === TreeNavigationResult.NotFound) {
			continue;
		}
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

export const populatedInitialState: TreeContent<
	typeof fuzzSchema.rootFieldSchema
>["initialTree"] = typedJsonCursor({
	[typedJsonCursor.type]: fuzzNode,
	sequenceChildren: [
		{
			[typedJsonCursor.type]: fuzzNode,
			sequenceChildren: ["AA", "AB", "AC"],
			requiredChild: "A",
		},
		{
			[typedJsonCursor.type]: fuzzNode,
			sequenceChildren: ["BA", "BB", "BC"],
			requiredChild: "B",
		},
		{
			[typedJsonCursor.type]: fuzzNode,
			sequenceChildren: ["CA", "CB", "CC"],
			requiredChild: "C",
		},
	],
	requiredChild: "R",
});
