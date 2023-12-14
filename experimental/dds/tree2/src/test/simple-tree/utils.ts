/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	TreeFieldSchema,
	ImplicitFieldSchema as OldImplicitFieldSchema,
	FlexTreeSchema,
	InsertableFlexField,
} from "../../feature-libraries";
import { InsertableTreeRoot, TreeFieldInner, getProxyForField } from "../../simple-tree";
import { SchemaBuilder } from "../../domains";
import {
	ImplicitFieldSchema,
	SchemaFactory,
	TreeConfiguration,
	TreeFieldFromImplicitField,
} from "../../class-tree";
// TODO: Does this need to be publicly exported?
// eslint-disable-next-line import/no-internal-modules
import { InsertableTreeFieldFromImplicitField } from "../../class-tree/internal";
import { TreeFactory } from "../../treeFactory";
import { typeboxValidator } from "../../external-utilities";
import { ForestType } from "../../shared-tree";
import { flexTreeWithContent } from "../utils";

/**
 * Helper for making small test schemas.
 * @deprecated - use makeSchema instead.
 */
export function makeOldSchema<const TSchema extends OldImplicitFieldSchema>(
	fn: (builder: SchemaBuilder) => TSchema,
) {
	const builder = new SchemaBuilder({
		scope: `test.schema.${Math.random().toString(36).slice(2)}`,
	});
	const root = fn(builder);
	return builder.intoSchema(root);
}

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 * @deprecated - use getRoot instead.
 */
export function getOldRoot<TRoot extends TreeFieldSchema>(
	schema: FlexTreeSchema<TRoot>,
	initialTree: InsertableTreeRoot<FlexTreeSchema<TRoot>>,
): TreeFieldInner<TRoot["kind"], TRoot["allowedTypes"], "maybeEmpty"> {
	const tree = flexTreeWithContent({
		schema,
		initialTree: initialTree as InsertableFlexField<TRoot>,
	});
	return getProxyForField<typeof schema.rootFieldSchema>(tree);
}

/**
 * Helper for making small test schemas.
 */
export function makeSchema<TSchema extends ImplicitFieldSchema>(
	fn: (factory: SchemaFactory) => TSchema,
) {
	return fn(new SchemaFactory(`test.schema.${Math.random().toString(36).slice(2)}`));
}

// Returns true if the given function is a class constructor (i.e., should be invoked with 'new')
// eslint-disable-next-line @typescript-eslint/ban-types
function isCtor(candidate: Function) {
	return candidate.prototype?.constructor.name !== undefined;
}

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 */
export function getRoot<TSchema extends ImplicitFieldSchema>(
	schema: TSchema | ((factory: SchemaFactory) => TSchema),
	initialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	// Schema objects may also be class constructors.
	if (typeof schema === "function" && !isCtor(schema)) {
		// eslint-disable-next-line no-param-reassign
		schema = makeSchema(schema as (builder: SchemaFactory) => TSchema);
	}
	const config = new TreeConfiguration(schema as TSchema, initialTree);
	const factory = new TreeFactory({
		jsonValidator: typeboxValidator,
		forest: ForestType.Reference,
	});
	const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
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
