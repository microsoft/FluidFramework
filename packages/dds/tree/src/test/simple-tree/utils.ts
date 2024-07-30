/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeForest } from "../../core/index.js";
import {
	buildForest,
	cursorForMapTreeNode,
	getSchemaAndPolicy,
	type NodeKeyManager,
} from "../../feature-libraries/index.js";
import {
	SchematizingSimpleTreeView,
	type ITreeCheckoutFork,
} from "../../shared-tree/index.js";
import {
	mapTreeFromNodeData,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type TreeFieldFromImplicitField,
} from "../../simple-tree/index.js";
import {
	getProxyForField,
	prepareContentForHydration,
	type InsertableContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/proxies.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { flexTreeFromForest, testIdCompressor, testRevisionTagCodec } from "../utils.js";

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 *
 * For minimal/concise targeted unit testing of specific simple-tree content.
 */
export function hydrate<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableTreeFieldFromImplicitField<TSchema>,
	nodeKeyManager?: NodeKeyManager,
): TreeFieldFromImplicitField<TSchema> {
	const forest = buildForest();
	const field = flexTreeFromForest(toFlexSchema(schema), forest, { nodeKeyManager });
	const mapTree = mapTreeFromNodeData(
		initialTree as InsertableContent,
		normalizeFieldSchema(schema).allowedTypes,
		field.context.nodeKeyManager,
		getSchemaAndPolicy(field),
	);
	prepareContentForHydration(mapTree, field.context.checkout.forest);
	const cursor = cursorForMapTreeNode(mapTree);
	initializeForest(forest, [cursor], testRevisionTagCodec, testIdCompressor, true);
	return getProxyForField(field) as TreeFieldFromImplicitField<TSchema>;
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

/**
 * Creates a branch of the input tree view and returns a new tree view for the branch.
 *
 * @remarks To merge the branch back into the original view after applying changes on the branch view, use
 * `<originalView>.checkout.merge(<branchView>.checkout)`.
 *
 * @param originalView - The tree view to branch.
 * @returns A new tree view for a branch of the input tree view, and an {@link ITreeCheckoutFork} object that can be
 * used to merge the branch back into the original view.
 */
export function getViewForForkedBranch<TSchema extends ImplicitFieldSchema>(
	originalView: SchematizingSimpleTreeView<TSchema>,
): { forkView: SchematizingSimpleTreeView<TSchema>; forkCheckout: ITreeCheckoutFork } {
	const forkCheckout = originalView.checkout.fork();
	return {
		forkView: new SchematizingSimpleTreeView<TSchema>(
			forkCheckout,
			originalView.config,
			originalView.nodeKeyManager,
		),
		forkCheckout,
	};
}
