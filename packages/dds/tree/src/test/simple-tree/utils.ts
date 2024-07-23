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
