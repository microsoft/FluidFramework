/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { join as pathJoin } from "node:path";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import type { FuzzSerializedIdCompressor } from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import {
	createIdCompressor,
	deserializeIdCompressor,
	toIdCompressorWithCore,
	type IIdCompressorCore,
	SerializationVersion,
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
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import type {
	ITreeCheckout,
	SchematizingSimpleTreeView,
	TreeCheckout,
} from "../../../shared-tree/index.js";
import type {
	SharedTreeOptionsInternal,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../shared-tree/sharedTree.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
	type ViewableTree,
	type NodeBuilderData,
} from "../../../simple-tree/index.js";
import type { ISharedTree } from "../../../treeFactory.js";
import { testSrcPath } from "../../testSrcPath.cjs";
import { assertUnique, expectEqualPaths, SharedTreeTestFactory } from "../../utils.js";

import type { FuzzView } from "./fuzzEditGenerators.js";

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
 * This extremely permissive schema is a valid superset over all possible schemas and is a reasonable type to use at compile time,
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

export const initialFuzzSchema = createFuzzSchema([]);
export const fuzzFieldSchema = FuzzNode.info.optionalChild;

/**
 * Creates the complete fuzz root schema from node-type identifiers.
 * The schema includes the recursive fuzz node, its array children, and the built-in string, number, and handle types.
 * Each dynamically added object schema has one required string field named `value`.
 *
 * @param nodeTypes - Unique, fully qualified node-type identifiers.
 * Built-in leaf types, `treeFuzz.node`, and `treeFuzz.arrayChildren` are already included.
 * @returns The tree's schema used for the fuzz view.
 */
export function createFuzzSchema(nodeTypes: readonly string[]): typeof fuzzFieldSchema {
	assertUnique(nodeTypes, "Duplicate fuzz node schema identifier");

	const fuzzNodeTypePrefix = `${builder.scope}.`;
	const fluidLeafTypePrefix = "com.fluidframework.leaf.";
	// Schemas that are present in all fuzz tests and don't require dynamic creation.
	const shortIdentifierOf = (fullIdentifier: string) =>
		fullIdentifier.slice(fuzzNodeTypePrefix.length);
	const commonNodes = new Set<string>([FuzzNode.identifier, ArrayChildren.identifier]);

	const schemaFactory = new SchemaFactory(builder.scope);
	const guidNodeSchemas = [];
	for (const nodeType of nodeTypes) {
		assert(
			nodeType.startsWith(fuzzNodeTypePrefix) || nodeType.startsWith(fluidLeafTypePrefix),
			"Expected a treeFuzz or built-in leaf schema identifier",
		);
		if (nodeType.startsWith(fluidLeafTypePrefix) || commonNodes.has(nodeType)) {
			continue;
		}
		class GuidNode extends schemaFactory.object(shortIdentifierOf(nodeType), {
			value: schemaFactory.required(schemaFactory.string),
		}) {}
		guidNodeSchemas.push(GuidNode);
	}

	const leafTypes = [
		schemaFactory.string,
		schemaFactory.number,
		schemaFactory.handle,
	] as const;
	// All fields in fuzz schema can have any of the leaf types, recursive nodes, or dynamically created GUID nodes.
	const allowedTypes = [() => UpgradedNode, ...leafTypes, ...guidNodeSchemas] as const;
	// The class names have "Upgraded" to reflect the fact that they are widenings of the original node and array types
	// used at the start of a given fuzz test. This also avoids shadowing the original `Node` and `ArrayChildren` classes.
	// Note that they should still use the original identifiers, since we're simulating a scenario where a data model has
	// expanded over time.
	class UpgradedArrayChildren extends schemaFactory.arrayRecursive(
		shortIdentifierOf(ArrayChildren.identifier),
		allowedTypes,
	) {}
	class UpgradedNode extends schemaFactory.objectRecursive(
		shortIdentifierOf(FuzzNode.identifier),
		{
			requiredChild: allowedTypes,
			optionalChild: schemaFactory.optionalRecursive(allowedTypes),
			arrayChildren: UpgradedArrayChildren,
		},
	) {}

	{
		type _check = ValidateRecursiveSchema<typeof UpgradedNode>;
	}
	return UpgradedNode.info.optionalChild as unknown as typeof fuzzFieldSchema;
}

export function nodeSchemaFromTreeSchema(
	treeSchema: typeof fuzzFieldSchema,
): typeof FuzzNode | undefined {
	const nodeSchema = [...treeSchema.allowedTypeSet].find(
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
		protected override readonly onCreate: (tree: ISharedTree) => void,
		protected override readonly onLoad?: (tree: ISharedTree) => void,
		options: SharedTreeOptionsInternal = {},
	) {
		super(onCreate, onLoad, {
			...options,
			jsonValidator: FormatValidatorBasic,
		});
	}
}

export const FuzzTestOnCreate = (tree: ViewableTree): void => {
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

export function convertToFuzzView(
	view: SchematizingSimpleTreeView<typeof fuzzFieldSchema>,
	currentSchema: typeof FuzzNode,
): asserts view is FuzzView {
	type UnschematizedFuzzView = Omit<FuzzView, "currentSchema"> &
		Partial<Pick<FuzzView, "currentSchema">>;
	(view as UnschematizedFuzzView).currentSchema = currentSchema;
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
): void {
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
): IIdCompressor & IIdCompressorCore => {
	return toIdCompressorWithCore(
		summary === undefined
			? createIdCompressor(sessionId, SerializationVersion.V3)
			: summary.withSession
				? deserializeIdCompressor(summary.serializedCompressor, SerializationVersion.V3)
				: deserializeIdCompressor(
						summary.serializedCompressor,
						sessionId,
						SerializationVersion.V3,
					),
	);
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
