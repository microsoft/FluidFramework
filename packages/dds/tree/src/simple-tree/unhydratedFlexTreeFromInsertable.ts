/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import { hasSingle } from "../util/index.js";

import { type ImplicitFieldSchema, normalizeFieldSchema, FieldKind } from "./fieldSchema.js";
import {
	CompatibilityLevel,
	getKernel,
	getTreeNodeSchemaPrivateData,
	isTreeNode,
	type TreeNode,
	type TreeNodeSchema,
	type Unhydrated,
	UnhydratedFlexTreeNode,
} from "./core/index.js";
import { getUnhydratedContext } from "./createContext.js";

/**
 * Transforms an input {@link TypedNode} tree to an {@link UnhydratedFlexTreeNode}.
 * @param data - The input tree to be converted.
 * If the data is an unsupported value (e.g. NaN), a fallback value will be used when supported,
 * otherwise an error will be thrown.
 *
 * Fallbacks:
 *
 * * `NaN` =\> `null`
 *
 * * `+/-∞` =\> `null`
 *
 * * `-0` =\> `+0`
 *
 * For fields with a default value, the field may be omitted.
 * If `context` is not provided, defaults which require a context will be left empty which can be out of schema.
 *
 * @param allowedTypes - The set of types allowed by the parent context. Used to validate the input tree.
 * @remarks
 * The resulting tree will be populated with any defaults from {@link FieldProvider}s in the schema.
 *
 * Often throws UsageErrors for invalid data, but may miss some cases.
 *
 * Output should comply with the provided view schema, but this is not explicitly validated:
 * validation against stored schema (to guard against document corruption) is done elsewhere.
 */
export function unhydratedFlexTreeFromInsertable<TIn extends InsertableContent | undefined>(
	data: TIn,
	allowedTypes: ImplicitFieldSchema,
): TIn extends undefined ? undefined : UnhydratedFlexTreeNode {
	const normalizedFieldSchema = normalizeFieldSchema(allowedTypes);

	if (data === undefined) {
		// TODO: this code-path should support defaults
		if (normalizedFieldSchema.kind !== FieldKind.Optional) {
			throw new UsageError("Got undefined for non-optional field.");
		}
		return undefined as TIn extends undefined ? undefined : UnhydratedFlexTreeNode;
	}

	const flexTree: UnhydratedFlexTreeNode = unhydratedFlexTreeFromInsertableNode(
		data,
		normalizedFieldSchema.allowedTypeSet,
	);

	return flexTree as TIn extends undefined ? undefined : UnhydratedFlexTreeNode;
}

/**
 * Copy content from `data` into a UnhydratedFlexTreeNode.
 */
export function unhydratedFlexTreeFromInsertableNode(
	data: InsertableContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): UnhydratedFlexTreeNode {
	if (isTreeNode(data)) {
		const kernel = getKernel(data);
		const inner = kernel.getInnerNodeIfUnhydrated();
		if (inner === undefined) {
			// The node is already hydrated, meaning that it already got inserted into the tree previously
			throw new UsageError("A node may not be inserted into the tree more than once");
		} else {
			if (!allowedTypes.has(kernel.schema)) {
				throw new UsageError("Invalid schema for this context.");
			}
			return inner;
		}
	}

	const schema = getType(data, allowedTypes);
	const handler = getTreeNodeSchemaPrivateData(schema).idempotentInitialize();
	const result = handler.toFlexContent(data, allowedTypes);

	return new UnhydratedFlexTreeNode(...result, getUnhydratedContext(schema));
}

function getType(
	data: FactoryContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): TreeNodeSchema {
	const possibleTypes = getPossibleTypes(allowedTypes, data);
	if (possibleTypes.length === 0) {
		throw new UsageError(
			`The provided data is incompatible with all of the types allowed by the schema. The set of allowed types is: ${JSON.stringify(
				[...allowedTypes].map((schema) => schema.identifier),
			)}.`,
		);
	}
	if (!hasSingle(possibleTypes)) {
		throw new UsageError(
			`The provided data is compatible with more than one type allowed by the schema.
The set of possible types is ${JSON.stringify([
				...possibleTypes.map((schema) => schema.identifier),
			])}.
Explicitly construct an unhydrated node of the desired type to disambiguate.
For class-based schema, this can be done by replacing an expression like "{foo: 1}" with "new MySchema({foo: 1})".`,
		);
	}
	return possibleTypes[0];
}

/**
 * Returns all types for which the data is schema-compatible.
 */
export function getPossibleTypes(
	allowedTypes: ReadonlySet<TreeNodeSchema>,
	data: FactoryContent,
): TreeNodeSchema[] {
	assert(data !== undefined, 0x889 /* undefined cannot be used as FactoryContent. */);

	let best = CompatibilityLevel.None;
	const possibleTypes: TreeNodeSchema[] = [];
	for (const schema of allowedTypes) {
		const handler = getTreeNodeSchemaPrivateData(schema).idempotentInitialize();
		const level = handler.shallowCompatibilityTest(data);
		if (level > best) {
			possibleTypes.length = 0;
			best = level;
		}
		if (best === level) {
			possibleTypes.push(schema);
		}
	}
	return best === CompatibilityLevel.None ? [] : possibleTypes;
}

/**
 * Content which can be used to build a node.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 * @system @alpha
 */
export type FactoryContent =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| Iterable<readonly [string, InsertableContent]>
	| readonly InsertableContent[]
	| FactoryContentObject;

/**
 * Record-like object which can be used to build some kinds of nodes.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 *
 * Supports object and map nodes.
 * @system @alpha
 */
export type FactoryContentObject = {
	readonly [P in string]?: InsertableContent;
};

/**
 * Content which can be inserted into a tree.
 * @system @alpha
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;
