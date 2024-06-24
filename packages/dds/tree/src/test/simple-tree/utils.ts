/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockNodeKeyManager, type NodeKeyManager } from "../../feature-libraries/index.js";
import {
	cursorFromUnhydratedRoot,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type TreeFieldFromImplicitField,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getProxyForField } from "../../simple-tree/proxies.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { flexTreeWithContent } from "../utils.js";

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
	const hydratedInitialTree = cursorFromUnhydratedRoot(
		schema,
		initialTree,
		nodeKeyManager ?? new MockNodeKeyManager(),
	);
	const tree = flexTreeWithContent({
		schema: toFlexSchema(schema),
		initialTree: hydratedInitialTree,
	});
	return getProxyForField(tree) as TreeFieldFromImplicitField<TSchema>;
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
