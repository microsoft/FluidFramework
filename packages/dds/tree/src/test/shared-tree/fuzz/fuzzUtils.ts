/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { join as pathJoin } from "node:path";

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
import type { ITreeCheckout, SharedTree, TreeCheckout } from "../../../shared-tree/index.js";
import { testSrcPath } from "../../testSrcPath.cjs";
import { expectEqualPaths, SharedTreeTestFactory } from "../../utils.js";
import type {
	NodeBuilderData,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/schemaTypes.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeNodeSchema,
	type ValidateRecursiveSchema,
	type ViewableTree,
} from "../../../simple-tree/index.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

// eslint-disable-next-line import/no-internal-modules
import type { SharedTreeOptionsInternal } from "../../../shared-tree/sharedTree.js";
import { typeboxValidator } from "../../../external-utilities/index.js";

const builder = new SchemaFactory("treeFuzz");
export class GUIDNode extends builder.object("GuidNode" as string, {
	value: builder.optional(builder.string),
}) {}

export type InitialAllowedFuzzTypes = number | string | IFluidHandle | GUIDNode | FuzzNode;

const initialAllowedTypes = [
	builder.string,
	builder.number,
	builder.handle,
	GUIDNode,
	() => FuzzNode,
] as const;

export class ArrayChildren extends builder.arrayRecursive(
	"arrayChildren",
	initialAllowedTypes,
) {}

{
	type _checkArrayChildren = ValidateRecursiveSchema<typeof ArrayChildren>;
}

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
	arrayChildren: ArrayChildren,
}) {}
type _checkFuzzNode = ValidateRecursiveSchema<typeof FuzzNode>;

export type FuzzNodeSchema = typeof FuzzNode;

export const initialFuzzSchema = createTreeViewSchema([]);
export const fuzzFieldSchema = FuzzNode.info.optionalChild;

/**
 *
 * @param nodeTypes - The additional node types outside of the {@link initialAllowedTypes} that the fuzzNode is allowed to contain
 * @param schemaFactory - The schemaFactory used to build the {@link FuzzNodeSchema}. The scope prefix must be "treeFuzz".
 * @returns the {@link FuzzNodeSchema} with the {@link initialAllowedTypes}, as well as the additional nodeTypes passed in.
 */
function createFuzzNodeSchema(
	nodeTypes: TreeNodeSchema[],
	schemaFactory: SchemaFactory<"treeFuzz">,
): FuzzNodeSchema {
	class ArrayChildren2 extends schemaFactory.arrayRecursive("arrayChildren", [
		() => Node,
		schemaFactory.string,
		schemaFactory.number,
		schemaFactory.handle,
		...nodeTypes,
	]) {}
	class Node extends schemaFactory.objectRecursive("node", {
		requiredChild: [
			() => Node,
			schemaFactory.string,
			schemaFactory.number,
			schemaFactory.handle,
			...nodeTypes,
		],
		optionalChild: schemaFactory.optionalRecursive([
			() => Node,
			schemaFactory.string,
			schemaFactory.number,
			schemaFactory.handle,
			...nodeTypes,
		]),
		arrayChildren: ArrayChildren2,
	}) {}

	{
		type _check = ValidateRecursiveSchema<typeof Node>;
	}
	return Node as unknown as FuzzNodeSchema;
}

/**
 * This function is used to create a new schema which is a superset of the previous tree's schema.
 * @param allowedTypes - additional allowedTypes outside of the {@link initialAllowedTypes} for the {@link FuzzNode}
 * @returns the tree's schema used for the fuzzView.
 */
export function createTreeViewSchema(allowedTypes: TreeNodeSchema[]): typeof fuzzFieldSchema {
	const schemaFactory = new SchemaFactory("treeFuzz");
	const node = createFuzzNodeSchema(allowedTypes, schemaFactory).info.optionalChild;
	return node as unknown as typeof fuzzFieldSchema;
}

export function nodeSchemaFromTreeSchema(treeSchema: typeof fuzzFieldSchema) {
	const nodeSchema = Array.from(treeSchema.allowedTypeSet).find(
		(treeNodeSchema) => treeNodeSchema.identifier === "treeFuzz.node",
	) as typeof FuzzNode | undefined;
	return nodeSchema;
}

export class SharedTreeFuzzTestFactory extends SharedTreeTestFactory {
	/**
	 * @param onCreate - Called once for each created tree (not called for trees loaded from summaries).
	 * @param onLoad - Called once for each tree that is loaded from a summary.
	 */
	public constructor(
		protected override readonly onCreate: (tree: SharedTree) => void,
		protected override readonly onLoad?: (tree: SharedTree) => void,
		options: SharedTreeOptionsInternal = {},
	) {
		super(onCreate, onLoad, {
			...options,
			jsonValidator: typeboxValidator,
			disposeForksAfterTransaction: false,
		});
	}
}

export const FuzzTestOnCreate = (tree: ViewableTree) => {
	const view = tree.viewWith(new TreeViewConfiguration({ schema: initialFuzzSchema }));
	view.initialize(populatedInitialState);
	view.dispose();
};

export function createOnCreate(
	initialState: NodeBuilderData<typeof FuzzNode> | undefined,
): (tree: ViewableTree) => void {
	return (tree: ViewableTree) => {
		const view = tree.viewWith(new TreeViewConfiguration({ schema: initialFuzzSchema }));
		view.initialize(initialState);
		view.dispose();
	};
}

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

export type RevertibleSharedTreeView = TreeCheckout & {
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
	arrayChildren: [
		{
			arrayChildren: ["AA", "AB", "AC"],
			requiredChild: "A",
			optionalChild: undefined,
		},
		{
			arrayChildren: ["BA", "BB", "BC"],
			requiredChild: "B",
			optionalChild: undefined,
		},
		{
			arrayChildren: ["CA", "CB", "CC"],
			requiredChild: "C",
			optionalChild: undefined,
		},
	],
	requiredChild: "R",
	optionalChild: undefined,
} as unknown as NodeBuilderData<typeof FuzzNode>;
