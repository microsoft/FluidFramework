/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, debugAssert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { filterIterable, hasSingle, oneFromIterable } from "../util/index.js";

import {
	CompatibilityLevel,
	getKernel,
	getTreeNodeSchemaPrivateData,
	isTreeNode,
	type TreeNode,
	type TreeNodeSchema,
	contentSchemaSymbol,
	type Unhydrated,
	UnhydratedFlexTreeNode,
} from "./core/index.js";
import { getUnhydratedContext } from "./createContext.js";
import { normalizeFieldSchema, FieldKind, type ImplicitFieldSchema } from "./fieldSchema.js";

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
			throw new UsageError(
				`Got undefined for non-optional field expecting one of ${quotedAllowedTypesWithNames(normalizedFieldSchema.allowedTypeSet)}`,
			);
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
 * Throw a usage error with a helpful message about `schema` not being in `allowedTypes` for insertable content.
 */
function allowedTypesInsertableSchemaError(
	allowedTypes: ReadonlySet<TreeNodeSchema>,
	schema: TreeNodeSchema,
): never {
	debugAssert(
		() =>
			!allowedTypes.has(schema) ||
			"This function should only be called if the schema is not in the allowed types.",
	);
	const map = new Map([...allowedTypes].map((s) => [s.identifier, s]));
	const expected = map.get(schema.identifier);
	if (expected !== undefined) {
		throw new UsageError(
			`A node with schema ${quotedSchemaIdentifierWithName(schema)} was provided where a node with that identifier is allowed, but the actual schema required (${quotedSchemaIdentifierWithName(expected)}) is not the same schema object.
TreeNodeSchema have significant object identity and thus the exact same object must be used as the schema when defining what nodes are allowed and when constructing the node to use.`,
		);
	}
	throw new UsageError(
		`Expected insertable for one of ${quotedAllowedTypesWithNames(allowedTypes)}. Got node with schema ${quotedSchemaIdentifierWithName(schema)}.
Nodes are valid insertable objects, but only if their schema are in the allowed list.`,
	);
}

/**
 * Gets a description of a schema for use in error messages.
 */
function quotedSchemaIdentifierWithName(schema: TreeNodeSchema): string {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	return `${JSON.stringify(schema.identifier)} (name: ${JSON.stringify((schema as Function).name)})`;
}

/**
 * Gets a description of an allowedTypes for use in error messages.
 */
function quotedAllowedTypesWithNames(allowedTypes: Iterable<TreeNodeSchema>): string {
	return `[${[...allowedTypes].map(quotedSchemaIdentifierWithName).join(", ")}]`;
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
			throw new UsageError(
				`A node with schema ${quotedSchemaIdentifierWithName(kernel.schema)} was inserted into the tree more than once. This is not supported.`,
			);
		} else {
			if (!allowedTypes.has(kernel.schema)) {
				allowedTypesInsertableSchemaError(allowedTypes, kernel.schema);
			}
			return inner;
		}
	}

	const schema = getType(data, allowedTypes);
	const handler = getTreeNodeSchemaPrivateData(schema).idempotentInitialize();
	const result = handler.toFlexContent(data, allowedTypes);

	// Might not match schema due to fallbacks, see TODO on toFlexContent
	// TODO: fix TODO in `toFlexContent`, and remove this.
	const finalSchema =
		oneFromIterable(filterIterable(allowedTypes, (s) => s.identifier === result[0].type)) ??
		fail(0xc9d /* missing schema */);

	return new UnhydratedFlexTreeNode(...result, getUnhydratedContext(finalSchema));
}

function getType(
	data: FactoryContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): TreeNodeSchema {
	const possibleTypes = getPossibleTypes(allowedTypes, data);
	if (possibleTypes.length === 0) {
		throw new UsageError(
			`The provided data is incompatible with all of the types allowed by the schema. The set of allowed types is: ${quotedAllowedTypesWithNames(allowedTypes)}.`,
		);
	}
	if (!hasSingle(possibleTypes)) {
		throw new UsageError(
			`The provided data is compatible with more than one type allowed by the schema.
The set of possible types is ${quotedAllowedTypesWithNames(possibleTypes)}.
Explicitly construct an unhydrated node of the desired type to disambiguate.
For class-based schema, this can be done by replacing an expression like "{foo: 1}" with "new MySchema({foo: 1})".`,
		);
	}
	return possibleTypes[0];
}

/**
 * Returns all types for which the data is schema-compatible.
 * @remarks This will respect the {@link contentSchemaSymbol} property on data to disambiguate types - if present, only that type will be returned.
 */
export function getPossibleTypes(
	allowedTypes: ReadonlySet<TreeNodeSchema>,
	data: FactoryContent,
): TreeNodeSchema[] {
	assert(data !== undefined, 0x889 /* undefined cannot be used as FactoryContent. */);

	let toCheck: Iterable<TreeNodeSchema>;
	if (typeof data === "object" && data !== null && contentSchemaSymbol in data) {
		// If the data has an explicit brand via contentSchemaSymbol, only check that type.
		const type = data[contentSchemaSymbol];
		toCheck = filterIterable(allowedTypes, (schema) => schema.identifier === type);
	} else {
		toCheck = allowedTypes;
	}

	// Start at the lowest level of compat we would ever accept: this discards types which are less compatible.
	let best = CompatibilityLevel.Low;
	const possibleTypes: TreeNodeSchema[] = [];
	for (const schema of toCheck) {
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
	return possibleTypes;
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
