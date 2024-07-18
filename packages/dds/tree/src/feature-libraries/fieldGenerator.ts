/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, MapTree, TreeFieldStoredSchema } from "../core/index.js";

import type { FlexTreeSchema } from "./typed-schema/index.js";

/**
 * Information needed to interpret a subtree described by {@link ContextuallyTypedNodeData} and {@link ContextuallyTypedFieldData}.
 * TODO:
 * Currently being exposed at the package level which also requires us to export MapTree at the package level.
 * Refactor the FieldGenerator to use JsonableTree instead of MapTree, and convert them internally.
 * @internal
 */
export interface TreeDataContext {
	/**
	 * Schema for the document which the tree will be used in.
	 */
	readonly schema: FlexTreeSchema;

	/**
	 * Procedural data generator for fields.
	 * Fields which provide generators here can be omitted in the input contextually typed data.
	 *
	 * @remarks
	 * TODO:
	 * For implementers of this which are not pure (like identifier generation),
	 * order of invocation should be made consistent and documented.
	 * This will be important for identifier elision optimizations in tree encoding for session based identifier generation.
	 */
	fieldSource?(key: FieldKey, schema: TreeFieldStoredSchema): undefined | FieldGenerator;
}

/**
 * Generates field content for a MapTree on demand.
 * TODO:
 * Currently being exposed at the package level which also requires us to export MapTree at the package level.
 * Refactor the FieldGenerator to use JsonableTree instead of MapTree, and convert them internally.
 * @internal
 */
export type FieldGenerator = () => MapTree[];
/**
 * Information needed to interpret a subtree described by {@link ContextuallyTypedNodeData} and {@link ContextuallyTypedFieldData}.
 * TODO:
 * Currently being exposed at the package level which also requires us to export MapTree at the package level.
 * Refactor the FieldGenerator to use JsonableTree instead of MapTree, and convert them internally.
 * @internal
 */
