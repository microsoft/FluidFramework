/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlexFieldSchema } from "../../feature-libraries/index.js";
import { FlexTreeView } from "../../shared-tree/index.js";
import {
	ImplicitFieldSchema,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
	toFlexConfig,
	WrapperTreeView,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getProxyForField } from "../../simple-tree/proxies.js";
import { flexTreeViewWithContent, flexTreeWithContent } from "../utils.js";

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
): WrapperTreeView<TSchema, FlexTreeView<FlexFieldSchema>> {
	const flexConfig = toFlexConfig(config);
	const view = flexTreeViewWithContent(flexConfig);
	return new WrapperTreeView<TSchema, FlexTreeView<FlexFieldSchema>>(view);
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
