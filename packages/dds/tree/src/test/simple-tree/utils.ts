/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createMockNodeKeyManager,
	nodeKeyFieldKey as defaultNodeKeyFieldKey,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";
import {
	ImplicitFieldSchema,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
	toFlexConfig,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getProxyForField } from "../../simple-tree/proxies.js";
import { brand } from "../../util/index.js";
import { checkoutWithContent, flexTreeWithContent } from "../utils.js";

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 *
 * For minimal/concise targeted unit testing of specific simple-tree content.
 */
export function hydrate<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	const config = new TreeConfiguration(schema, () => initialTree);
	const flexConfig = toFlexConfig(config);
	const tree = flexTreeWithContent(flexConfig);
	return getProxyForField(tree) as TreeFieldFromImplicitField<TSchema>;
}

/**
 * Given the TreeConfiguration, returns a view.
 *
 * This works a much like the actual package public API as possible, while avoiding the actual SharedTree object.
 * This should allow realistic (app like testing) of all the simple-tree APIs.
 */
export function getView<TSchema extends ImplicitFieldSchema>(
	config: TreeConfiguration<TSchema>,
): SchematizingSimpleTreeView<TSchema> {
	const flexConfig = toFlexConfig(config);
	const checkout = checkoutWithContent(flexConfig);
	return new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createMockNodeKeyManager(),
		brand(defaultNodeKeyFieldKey),
	);
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
