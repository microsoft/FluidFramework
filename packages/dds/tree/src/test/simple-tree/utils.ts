/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { initializeForest, TreeStoredSchemaRepository } from "../../core/index.js";
import {
	buildForest,
	cursorForMapTreeNode,
	getSchemaAndPolicy,
	MockNodeKeyManager,
} from "../../feature-libraries/index.js";
import {
	isTreeNode,
	isTreeNodeSchemaClass,
	mapTreeFromNodeData,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type NodeKind,
	type TreeFieldFromImplicitField,
	type TreeNodeSchema,
} from "../../simple-tree/index.js";
import {
	getTreeNodeForField,
	prepareContentForHydration,
	type InsertableContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/proxies.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema, toStoredSchema } from "../../simple-tree/toFlexSchema.js";
import { mintRevisionTag, testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { CheckoutFlexTreeView, createTreeCheckout } from "../../shared-tree/index.js";

/**
 * Initializes a node with the given schema and content.
 * @param schema - The schema of the node being initialized
 * @param content - The content that will be used to construct the node, or an unhydrated node of the correct `schema`.
 * @param hydrateNode - Whether or not the returned value will be hydrated.
 * @returns
 * * If `hydrateNode` is true, a hydrated node will be returned.
 * * If `hydrateNode` is false, then `content` will be used to initialize an unhydrated node (or, if `content` is already a hydrated node, it will be returned directly).
 * @remarks This function is useful for writing tests that want to test both the hydrated version of a node and the unhydrated version of a node with minimal code duplication.
 */
export function initNode<
	TInsertable,
	TSchema extends TreeNodeSchema<string, NodeKind, unknown, TInsertable>,
>(
	schema: TSchema,
	content: TInsertable,
	hydrateNode: boolean,
): TreeFieldFromImplicitField<TSchema> {
	if (hydrateNode) {
		return hydrate(schema, content as InsertableTreeFieldFromImplicitField<TSchema>);
	}

	if (isTreeNode(content)) {
		return content as TreeFieldFromImplicitField<TSchema>;
	}

	if (isTreeNodeSchemaClass(schema)) {
		return new schema(content) as TreeFieldFromImplicitField<TSchema>;
	}

	return schema.create(content) as TreeFieldFromImplicitField<TSchema>;
}

/**
 * Generates a `describe` block for test suites that want to test both unhydrated and hydrated nodes.
 * @param title - the title of the test suite
 * @param runBoth - a suite that will be run twice, each in a different nested `describe` block.
 * The suite has access to an initialize function (see {@link initNode}) and a boolean that can be used to produce unhydrated nodes or hydrated nodes.
 * @param runOnce - an optional extra delegate that will run inside of the outer describe block.
 * This is useful for test cases that don't distinguish between unhydrated and hydrated scenarios.
 */
export function describeHydration(
	title: string,
	runBoth: (
		init: <
			TInsertable,
			TSchema extends TreeNodeSchema<string, NodeKind, unknown, TInsertable>,
		>(
			schema: TSchema,
			tree: TInsertable,
		) => TreeFieldFromImplicitField<TSchema>,
		hydrated: boolean,
	) => void,
	runOnce?: () => void,
) {
	return describe(title, () => {
		describe("🐪 Unhydrated", () =>
			runBoth((schema, tree) => initNode(schema, tree, false), false));

		describe("🌊 Hydrated", () =>
			runBoth((schema, tree) => initNode(schema, tree, true), true));

		runOnce?.();
	});
}

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 *
 * For minimal/concise targeted unit testing of specific simple-tree content.
 *
 * TODO: determine and document if this produces "cooked" or "marinated" nodes.
 */
export function hydrate<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	const forest = buildForest();

	const branch = createTreeCheckout(testIdCompressor, mintRevisionTag, testRevisionTagCodec, {
		forest,
		schema: new TreeStoredSchemaRepository(toStoredSchema(schema)),
	});
	const manager = new MockNodeKeyManager();
	const field = new CheckoutFlexTreeView(branch, toFlexSchema(schema), manager).flexTree;

	assert(field.context !== undefined, "Expected LazyField");
	const mapTree = mapTreeFromNodeData(
		initialTree as InsertableContent,
		schema,
		field.context.nodeKeyManager,
		getSchemaAndPolicy(field),
	);
	prepareContentForHydration(mapTree, field.context.checkout.forest);
	if (mapTree === undefined) return undefined as TreeFieldFromImplicitField<TSchema>;
	const cursor = cursorForMapTreeNode(mapTree);
	initializeForest(forest, [cursor], testRevisionTagCodec, testIdCompressor, true);
	return getTreeNodeForField(field) as TreeFieldFromImplicitField<TSchema>;
}

/**
 * Similar to JSON stringify, but allows `undefined` at the root and returns numbers as-is at the root.
 */
export function pretty(arg: unknown): number | string {
	if (arg === undefined) {
		return "undefined";
	}
	if (typeof arg === "number") {
		return arg;
	}
	return JSON.stringify(arg);
}
