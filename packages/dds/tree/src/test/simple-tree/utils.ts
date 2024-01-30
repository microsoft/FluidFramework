/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createIdCompressor } from "@fluidframework/id-compressor";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ImplicitFieldSchema,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import { ForestType } from "../../shared-tree/index.js";

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 */
export function getRoot<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	const config = new TreeConfiguration(schema, initialTree);
	const factory = new TreeFactory({
		jsonValidator: typeboxValidator,
		forest: ForestType.Reference,
	});
	const tree = factory.create(
		new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor(),
		}),
		"tree",
	);
	const root = tree.schematize(config).root;
	return root;
}

/**
 * Similar to JSON stringify, but preserves `undefined` and numbers numbers as-is at the root.
 */

export function pretty(arg: unknown): number | undefined | string {
	if (arg === undefined) {
		return "undefined";
	}
	if (typeof arg === "number") {
		return arg;
	}
	if (typeof arg === "string") {
		return `"${arg}"`;
	}
	return JSON.stringify(arg);
}
