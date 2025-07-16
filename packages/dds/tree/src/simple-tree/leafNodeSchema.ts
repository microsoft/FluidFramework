/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { type TreeValue, ValueSchema } from "../core/index.js";
import {
	type FlexTreeNode,
	isFlexTreeNode,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";

import {
	NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type NodeSchemaMetadata,
	type TreeLeafValue,
	type TreeNodeSchemaCorePrivate,
	type TreeNodeSchemaPrivateData,
	privateDataSymbol,
	type TreeNodeSchemaInitializedData,
	CompatibilityLevel,
	type FlexContent,
} from "./core/index.js";
import type { SimpleLeafNodeSchema } from "./simpleSchema.js";
import { brand, type JsonCompatibleReadOnlyObject } from "../util/index.js";
import { getTreeNodeSchemaInitializedData } from "./createContext.js";
import type { FactoryContent } from "./unhydratedFlexTreeFromInsertable.js";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

/**
 * Instances of this class are schema for leaf nodes.
 * @remarks
 * Unlike other schema, leaf schema are class instances instead of classes themselves.
 * This is because the instance type (the tree node type) for leaves are not objects,
 * so those instances can't be instances of a schema based class.
 * @privateRemarks
 * This class refers to the underlying flex tree schema in its constructor, so this class can't be included in the package API.
 */
export class LeafNodeSchema<Name extends string, const T extends ValueSchema>
	implements
		TreeNodeSchemaNonClass<Name, NodeKind.Leaf, TreeValue<T>, TreeValue<T>>,
		SimpleLeafNodeSchema,
		TreeNodeSchemaCorePrivate
{
	public readonly identifier: Name;
	public readonly kind = NodeKind.Leaf;
	public readonly info: T;
	public readonly implicitlyConstructable = true as const;
	public readonly childTypes: ReadonlySet<TreeNodeSchema> = new Set();
	public readonly [privateDataSymbol]: TreeNodeSchemaPrivateData = {
		idempotentInitialize: () =>
			(this.#initializedData ??= getTreeNodeSchemaInitializedData(this, {
				shallowCompatibilityTest: (data: FactoryContent): CompatibilityLevel =>
					shallowCompatibilityTest(this, data),
				toFlexContent: (
					data: FactoryContent,
					allowedTypes: ReadonlySet<TreeNodeSchema>,
				): FlexContent => leafToFlexContent(data, this, allowedTypes),
			})),
		childAnnotatedAllowedTypes: [],
	};
	#initializedData: TreeNodeSchemaInitializedData | undefined;

	public create(data: TreeValue<T> | FlexTreeNode): TreeValue<T> {
		if (isFlexTreeNode(data)) {
			const value = data.value;
			assert(valueSchemaAllows(this.info, value), 0x916 /* invalid value */);
			return value;
		}
		return data;
	}

	public createFromInsertable(data: TreeValue<T>): TreeValue<T> {
		return data;
	}

	public readonly leafKind: ValueSchema;

	public readonly metadata: NodeSchemaMetadata = {};
	public readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;

	public constructor(name: Name, t: T) {
		this.identifier = name;
		this.info = t;
		this.leafKind = t;
	}
}

/**
 * Wrapper around LeafNodeSchema's constructor that provides the return type that is desired in the package public API.
 */
function makeLeaf<Name extends string, const T extends ValueSchema>(
	name: Name,
	t: T,
): LeafSchema<Name, TreeValue<T>> & SimpleLeafNodeSchema {
	// Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
	return new LeafNodeSchema(`com.fluidframework.leaf.${name}`, t);
}

/**
 * A {@link TreeNodeSchema} for a {@link TreeLeafValue}.
 * @remarks
 * This is just a more specific alias for a particular {@link TreeNodeSchemaNonClass}.
 * It only exists to make the API (particularly errors, IntelliSense, and generated .d.ts files) more readable.
 *
 * See {@link SchemaFactory} and its various properties for actual leaf schema objects.
 * @privateRemarks
 * This is an interface so its name will show up in things like type errors instead of the fully expanded TreeNodeSchemaNonClass.
 * @system @sealed @public
 */
export interface LeafSchema<Name extends string, T extends TreeLeafValue>
	extends TreeNodeSchemaNonClass<
		`com.fluidframework.leaf.${Name}`,
		NodeKind.Leaf,
		/* TNode */ T,
		/* TInsertable */ T,
		/* ImplicitlyConstructable */ true
	> {}

// Leaf schema shared between all SchemaFactory instances.
export const stringSchema = makeLeaf("string", ValueSchema.String);
export const numberSchema = makeLeaf("number", ValueSchema.Number);
export const booleanSchema = makeLeaf("boolean", ValueSchema.Boolean);
export const nullSchema = makeLeaf("null", ValueSchema.Null);
export const handleSchema = makeLeaf("handle", ValueSchema.FluidHandle);

/**
 * Checks if data might be schema-compatible.
 *
 * @returns false if `data` is incompatible with `type` based on a cheap/shallow check.
 *
 * Note that this may return true for cases where data is incompatible, but it must not return false in cases where the data is compatible.
 */
function shallowCompatibilityTest(
	schema: TreeNodeSchema,
	data: FactoryContent,
): CompatibilityLevel {
	if (isTreeValue(data)) {
		return allowsValue(schema, data) ? CompatibilityLevel.Normal : CompatibilityLevel.None;
	}

	return CompatibilityLevel.None;
}

function allowsValue(schema: TreeNodeSchema, value: TreeValue): boolean {
	if (schema.kind === NodeKind.Leaf) {
		return valueSchemaAllows(schema.info as ValueSchema, value);
	}
	return false;
}

/**
 * Transforms data under a Leaf schema.
 * @param data - The tree data to be transformed. Must be a {@link TreeValue}.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
export function leafToFlexContent(
	data: FactoryContent,
	schema: TreeNodeSchema,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): FlexContent {
	assert(schema.kind === NodeKind.Leaf, 0x921 /* Expected a leaf schema. */);
	if (!isTreeValue(data)) {
		// This rule exists to protect against useless `toString` output like `[object Object]`.
		// In this case, that's actually reasonable behavior, since object input is not compatible with Leaf schemas.
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		throw new UsageError(`Input data is incompatible with leaf schema: ${data}`);
	}

	const mappedValue = mapValueWithFallbacks(data, allowedTypes);
	const mappedSchema = [...allowedTypes].find((type) => allowsValue(type, mappedValue));

	assert(mappedSchema !== undefined, 0x84a /* Unsupported schema for provided primitive. */);

	const result: FlexContent = [
		{
			value: mappedValue,
			type: brand(mappedSchema.identifier),
		},
		new Map(),
	];

	return result;
}

/**
 * Checks an incoming {@link TreeLeafValue} to ensure it is compatible with its requirements.
 * For unsupported values with a schema-compatible replacement, return the replacement value.
 * For unsupported values without a schema-compatible replacement, throw.
 * For supported values, return the input.
 */
function mapValueWithFallbacks(
	value: TreeLeafValue,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): TreeValue {
	switch (typeof value) {
		case "number": {
			if (Object.is(value, -0)) {
				// Our serialized data format does not support -0.
				// Map such input to +0.
				return 0;
			} else if (!Number.isFinite(value)) {
				// Our serialized data format does not support NaN nor +/-∞.
				// If the schema supports `null`, fall back to that. Otherwise, throw.
				// This is intended to match JSON's behavior for such values.
				if (allowedTypes.has(nullSchema)) {
					return null;
				} else {
					throw new UsageError(`Received unsupported numeric value: ${value}.`);
				}
			} else {
				return value;
			}
		}
		case "string":
		// TODO:
		// This should detect invalid strings. Something like @stdlib/regexp-utf16-unpaired-surrogate could be used to do this.
		// See SchemaFactory.string for details.
		case "boolean":
			return value;
		case "object": {
			if (value === null || isFluidHandle(value)) {
				return value;
			}
		}
		default:
			throw new UsageError(`Received unsupported leaf value: ${value}.`);
	}
}
