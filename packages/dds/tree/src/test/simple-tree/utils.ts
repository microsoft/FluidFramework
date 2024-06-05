/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockNodeKeyManager, NodeKeyManager } from "../../feature-libraries/index.js";
import {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	toFlexConfig,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getProxyForField } from "../../simple-tree/proxies.js";
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
	const config = new TreeConfiguration(schema, () => initialTree);
	const flexConfig = toFlexConfig(config, nodeKeyManager ?? new MockNodeKeyManager());
	const tree = flexTreeWithContent(flexConfig);
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
