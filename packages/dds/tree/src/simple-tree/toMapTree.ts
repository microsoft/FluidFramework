/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type NodeData,
	type TreeValue,
	type ValueSchema,
} from "../core/index.js";
import { FieldKinds, isTreeValue, valueSchemaAllows } from "../feature-libraries/index.js";
import { brand, isReadonlyArray, hasSingle } from "../util/index.js";

import { nullSchema } from "./leafNodeSchema.js";
import {
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
	isConstant,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
	FieldKind,
	type TreeLeafValue,
	extractFieldProvider,
	type ContextualFieldProvider,
} from "./schemaTypes.js";
import {
	getKernel,
	isTreeNode,
	NodeKind,
	type TreeNode,
	type TreeNodeSchema,
	type Unhydrated,
	UnhydratedFlexTreeNode,
	UnhydratedSequenceField,
} from "./core/index.js";
// Required to prevent the introduction of new circular dependencies
// TODO: Having the schema provide their own policy functions for compatibility which
// toMapTree invokes instead of manually handling each kind would remove this bad
// dependency, and reduce coupling.
// eslint-disable-next-line import/no-internal-modules
import { isObjectNodeSchema } from "./node-kinds/object/objectNodeTypes.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-internal-modules
import { createField, type UnhydratedFlexTreeField } from "./core/unhydratedFlexTree.js";
import { convertFieldKind } from "./toStoredSchema.js";
import { getUnhydratedContext } from "./createContext.js";

/**
 * Module notes:
 *
 * The flow of the below code is in terms of the structure of the input data. We then verify that the associated
 * schema is appropriate for that kind of data. This is fine while we have a 1:1 mapping of kind of input data to
 * the kind of schema we expect for it (e.g. an input that is an array always need to be associated with a sequence in
 * the schema). If/when we begin accepting kinds of input data that are ambiguous (e.g. accepting an input that is an
 * array of key/value tuples to instantiate a map) we may need to rethink the structure here to be based more on the
 * schema than on the input data.
 */

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
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
 * @param context - An optional context which, if present, will allow defaults to be created by {@link ContextualFieldProvider}s.
 * If absent, only defaults from {@link ConstantFieldProvider}s will be created.
 * @param schemaValidationPolicy - The stored schema and policy to be used for validation, if the policy says schema
 * validation should happen. If it does, the input tree will be validated against this schema + policy, and an error will
 * be thrown if the tree does not conform to the schema. If undefined, no validation against the stored schema is done.
 * @remarks The resulting tree will be populated with any defaults from {@link FieldProvider}s in the schema.
 */
export function mapTreeFromNodeData<TIn extends InsertableContent | undefined>(
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

	const mapTree: UnhydratedFlexTreeNode = nodeDataToMapTree(
		data,
		normalizedFieldSchema.allowedTypeSet,
	);

	return mapTree as TIn extends undefined ? undefined : UnhydratedFlexTreeNode;
}

/**
 * Copy content from `data` into a MapTree.
 * Does NOT generate and default values for fields.
 * Often throws UsageErrors for invalid data, but may miss some cases.
 * @remarks
 * Output is likely out of schema even for valid input due to missing defaults.
 */
function nodeDataToMapTree(
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

	let result: FlexContent;
	switch (schema.kind) {
		case NodeKind.Leaf:
			result = leafToMapTree(data, schema, allowedTypes);
			break;
		case NodeKind.Array:
			result = arrayToMapTree(data, schema);
			break;
		case NodeKind.Map:
			result = mapToMapTree(data, schema);
			break;
		case NodeKind.Object:
			result = objectToMapTree(data, schema);
			break;
		default:
			unreachableCase(schema.kind);
	}

	return new UnhydratedFlexTreeNode(...result, getUnhydratedContext(schema));
}

type FlexContent = [NodeData, Map<FieldKey, UnhydratedFlexTreeField>];

/**
 * Transforms data under a Leaf schema.
 * @param data - The tree data to be transformed. Must be a {@link TreeValue}.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
function leafToMapTree(
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
	const mappedSchema = getType(mappedValue, allowedTypes);

	assert(
		allowsValue(mappedSchema, mappedValue),
		0x84a /* Unsupported schema for provided primitive. */,
	);

	return [
		{
			value: mappedValue,
			type: brand(mappedSchema.identifier),
		},
		new Map<FieldKey, UnhydratedFlexTreeField>(),
	];
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

/**
 * Transforms data under an Array schema.
 * @param data - The tree data to be transformed.
 * @param allowedTypes - The set of types allowed by the parent context. Used to validate the input tree.
 */
function arrayChildToMapTree(
	child: InsertableContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): UnhydratedFlexTreeNode {
	// We do not support undefined sequence entries.
	// If we encounter an undefined entry, use null instead if supported by the schema, otherwise throw.
	let childWithFallback = child;
	if (child === undefined) {
		if (allowedTypes.has(nullSchema)) {
			childWithFallback = null;
		} else {
			throw new TypeError(`Received unsupported array entry value: ${child}.`);
		}
	}
	return nodeDataToMapTree(childWithFallback, allowedTypes);
}

/**
 * Transforms data under an Array schema.
 * @param data - The tree data to be transformed. Must be an iterable.
 * @param schema - The schema associated with the value.
 * @param schemaValidationPolicy - The stored schema and policy to be used for validation, if the policy says schema
 * validation should happen. If it does, the input tree will be validated against this schema + policy, and an error will
 * be thrown if the tree does not conform to the schema. If undefined, no validation against the stored schema is done.
 */
function arrayToMapTree(data: FactoryContent, schema: TreeNodeSchema): FlexContent {
	assert(schema.kind === NodeKind.Array, 0x922 /* Expected an array schema. */);
	if (!(typeof data === "object" && data !== null && Symbol.iterator in data)) {
		throw new UsageError(`Input data is incompatible with Array schema: ${data}`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);

	const mappedData = Array.from(data, (child) =>
		arrayChildToMapTree(child, allowedChildTypes),
	);

	const context = getUnhydratedContext(schema).flexContext;

	// Array nodes have a single `EmptyKey` field:
	const fieldsEntries =
		mappedData.length === 0
			? []
			: ([
					[
						EmptyKey,
						new UnhydratedSequenceField(
							context,
							FieldKinds.sequence.identifier,
							EmptyKey,
							mappedData,
						),
					],
				] as const);

	return [
		{
			type: brand(schema.identifier),
		},
		new Map(fieldsEntries),
	];
}

/**
 * Transforms data under a Map schema.
 * @param data - The tree data to be transformed. Must be an iterable.
 * @param schema - The schema associated with the value.
 * @param schemaValidationPolicy - The stored schema and policy to be used for validation, if the policy says schema
 * validation should happen. If it does, the input tree will be validated against this schema + policy, and an error will
 * be thrown if the tree does not conform to the schema. If undefined, no validation against the stored schema is done.
 */
function mapToMapTree(data: FactoryContent, schema: TreeNodeSchema): FlexContent {
	assert(schema.kind === NodeKind.Map, 0x923 /* Expected a Map schema. */);
	if (!(typeof data === "object" && data !== null)) {
		throw new UsageError(`Input data is incompatible with Map schema: ${data}`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);

	const fieldsIterator = (
		Symbol.iterator in data
			? // Support iterables of key value pairs (including Map objects)
				data
			: // Support record objects for JSON style Map data
				Object.entries(data)
	) as Iterable<readonly [string, InsertableContent]>;

	const context = getUnhydratedContext(schema).flexContext;

	const transformedFields = new Map<FieldKey, UnhydratedFlexTreeField>();
	for (const item of fieldsIterator) {
		if (!isReadonlyArray(item) || item.length !== 2 || typeof item[0] !== "string") {
			throw new UsageError(`Input data is incompatible with map entry: ${item}`);
		}
		const [key, value] = item;
		assert(!transformedFields.has(brand(key)), 0x84c /* Keys should not be duplicated */);

		// Omit undefined values - an entry with an undefined value is equivalent to one that has been removed or omitted
		if (value !== undefined) {
			const child = nodeDataToMapTree(value, allowedChildTypes);
			const field = createField(context, FieldKinds.optional.identifier, brand(key), [child]);
			transformedFields.set(brand(key), field);
		}
	}

	return [
		{
			type: brand(schema.identifier),
		},
		transformedFields,
	];
}

/**
 * Transforms data under an Object schema.
 * @param data - The tree data to be transformed. Must be a Record-like object.
 * @param schema - The schema associated with the value.
 */
function objectToMapTree(data: FactoryContent, schema: TreeNodeSchema): FlexContent {
	assert(isObjectNodeSchema(schema), 0x924 /* Expected an Object schema. */);
	if (
		typeof data !== "object" ||
		data === null ||
		Symbol.iterator in data ||
		isFluidHandle(data)
	) {
		throw new UsageError(`Input data is incompatible with Object schema: ${data}`);
	}

	const fields = new Map<FieldKey, UnhydratedFlexTreeField>();
	const context = getUnhydratedContext(schema).flexContext;

	for (const [key, fieldInfo] of schema.flexKeyMap) {
		const value = getFieldProperty(data, key);

		let children: UnhydratedFlexTreeNode[] | ContextualFieldProvider;
		if (value === undefined) {
			const defaultProvider =
				fieldInfo.schema.props?.defaultProvider ??
				fail("missing field has no default provider");
			const fieldProvider = extractFieldProvider(defaultProvider);
			children = isConstant(fieldProvider) ? fieldProvider() : fieldProvider;
		} else {
			children = [nodeDataToMapTree(value, fieldInfo.schema.allowedTypeSet)];
		}

		const kind = convertFieldKind.get(fieldInfo.schema.kind) ?? fail("Invalid field kind");
		fields.set(
			fieldInfo.storedKey,
			createField(context, kind.identifier, fieldInfo.storedKey, children),
		);
	}

	return [{ type: brand(schema.identifier) }, fields];
}

/**
 * Check {@link FactoryContentObject} for a property which could be store a field.
 *
 * @returns If the property exists, return its value. Otherwise, returns undefined.
 * @remarks
 * The currently policy is to only consider own properties.
 * See {@link InsertableObjectFromSchemaRecord} for where this policy is documented in the public API.
 *
 * Explicit undefined values are treated the same as missing properties to allow explicit use of undefined with defaulted identifiers.
 *
 * @privateRemarks
 * If we ever want to have an optional field which defaults to something other than undefined, this will need changes.
 * It would need to adjusting the handling of explicit undefined in contexts where undefined is allowed, and a default provider also exists.
 */
function getFieldProperty(
	data: FactoryContentObject,
	key: string | symbol,
): InsertableContent | undefined {
	// This policy only allows own properties.
	if (Object.hasOwnProperty.call(data, key)) {
		return (data as Record<string, InsertableContent>)[key as string];
	}
	return undefined;
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
	let best = CompatibilityLevel.None;
	const possibleTypes: TreeNodeSchema[] = [];
	for (const schema of allowedTypes) {
		const level = shallowCompatibilityTest(schema, data);
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
 * Indicates a compatibility level for inferring a schema to apply to insertable data.
 * @remarks
 * Only the highest compatibility options are used.
 * This approach allows adding new possible matching at a new lower compatibility level as a non breaking change,
 * since that way they can't make a case that was compatible before ambiguous now.
 */
enum CompatibilityLevel {
	/**
	 * Not compatible. Constructor typing indicates incompatibility.
	 */
	None = 0,
	/**
	 * Additional compatibility cases added in Fluid Framework 2.2.
	 */
	Low = 1,
	/**
	 * Compatible in Fluid Framework 2.0.
	 */
	Normal = 2,
}

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
	assert(data !== undefined, 0x889 /* undefined cannot be used as FactoryContent. */);

	if (isTreeValue(data)) {
		return allowsValue(schema, data) ? CompatibilityLevel.Normal : CompatibilityLevel.None;
	}
	if (schema.kind === NodeKind.Leaf) {
		return CompatibilityLevel.None;
	}

	// Typing (of schema based constructors and thus implicit node construction)
	// allows iterables for constructing maps and arrays.
	// Some users of this API may have unions of maps and arrays,
	// and rely on Arrays ending up as array nodes and maps as Map nodes,
	// despite both being iterable and thus compatible with both.
	// This uses a priority based system where an array would be parsed as an array when unioned with a map,
	// but if in a map only context, could still be used as a map.

	if (data instanceof Map) {
		switch (schema.kind) {
			case NodeKind.Map:
				return CompatibilityLevel.Normal;
			case NodeKind.Array:
				// Maps are iterable, so type checking does allow constructing an ArrayNode from a map if the array's type is an array that includes the key and value types of the map.
				return CompatibilityLevel.Low;
			default:
				return CompatibilityLevel.None;
		}
	}

	if (isReadonlyArray(data)) {
		switch (schema.kind) {
			case NodeKind.Array:
				return CompatibilityLevel.Normal;
			case NodeKind.Map:
				// Arrays are iterable, so type checking does allow constructing an array from a MapNode from an if the array's type is key values pairs for the map.
				return CompatibilityLevel.Low;
			default:
				return CompatibilityLevel.None;
		}
	}

	const mapOrArray = schema.kind === NodeKind.Array || schema.kind === NodeKind.Map;

	if (Symbol.iterator in data) {
		return mapOrArray ? CompatibilityLevel.Normal : CompatibilityLevel.None;
	}

	// At this point, it is assumed data is a record-like object since all the other cases have been eliminated.

	if (schema.kind === NodeKind.Array) {
		return CompatibilityLevel.None;
	}

	if (schema.kind === NodeKind.Map) {
		// When not unioned with an ObjectNode, allow objects to be used to create maps.
		return CompatibilityLevel.Low;
	}

	assert(isObjectNodeSchema(schema), 0x9e6 /* unexpected schema kind */);

	// TODO: Improve type inference by making this logic more thorough. Handle at least:
	// * Types which are strict subsets of other types in the same polymorphic union
	// * Types which have the same keys but different types for those keys in the polymorphic union
	// * Types which have the same required fields but different optional fields and enough of those optional fields are populated to disambiguate

	// TODO#7441: Consider allowing data to be inserted which has keys that are extraneous/unknown to the schema (those keys are ignored)

	// If the schema has a required key which is not present in the input object, reject it.
	for (const [fieldKey, fieldSchema] of schema.fields) {
		if (fieldSchema.requiresValue) {
			if (getFieldProperty(data, fieldKey) === undefined) {
				return CompatibilityLevel.None;
			}
		}
	}

	return CompatibilityLevel.Normal;
}

function allowsValue(schema: TreeNodeSchema, value: TreeValue): boolean {
	if (schema.kind === NodeKind.Leaf) {
		return valueSchemaAllows(schema.info as ValueSchema, value);
	}
	return false;
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
