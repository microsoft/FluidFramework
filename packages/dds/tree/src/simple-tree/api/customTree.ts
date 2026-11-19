/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	forEachField,
	inCursorField,
	LeafNodeStoredSchema,
	mapCursorField,
	ObjectNodeStoredSchema,
	type FieldKey,
	type ITreeCursor,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeTypeSet,
} from "../../core/index.js";
import { FieldKinds, valueSchemaAllows } from "../../feature-libraries/index.js";
import { cloneWithReplacements } from "../../util/index.js";
import type { TreeNodeSchema, TreeLeafValue } from "../core/index.js";
import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "../leafNodeSchema.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";
import type { SchemaType, SimpleNodeSchema } from "../simpleSchema.js";

/**
 * Options for how to interpret or encode a tree when schema information is available.
 * @beta
 * @input
 */
export interface TreeEncodingOptions<TKeyOptions = KeyEncodingOptions> {
	/**
	 * How to handle field keys.
	 * @remarks
	 * Has no effect on {@link NodeKind}s other than {@link NodeKind.Object}.
	 *
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields|Unknown optional field} will be omitted when using property keys.
	 * @defaultValue {@link KeyEncodingOptions.usePropertyKeys}.
	 */
	readonly keys?: TKeyOptions;
}

/**
 * Options for how to interpret a tree when schema information is available.
 * @alpha
 * @input
 */
export type TreeParsingOptions = TreeEncodingOptions<
	KeyEncodingOptions.usePropertyKeys | KeyEncodingOptions.knownStoredKeys
>;

/**
 * Selects which fields of a node to include, and the filter for the content of each included field.
 * @param parentSchema - The stored schema of the node that has the field.
 * This is the stored schema, because content in {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown optional fields} can have no view schema.
 * The stored schema has fewer node kinds than the view schema.
 * The `kind` of a record node is {@link NodeKind.Map}, so a filter never gets {@link NodeKind.Record}.
 * @param storedKey - The {@link SimpleObjectFieldSchema.storedKey | stored key} of the field.
 * For map nodes and record nodes, this is the key of the entry.
 * For array nodes, this is the empty string, and the field contains all the elements of the array.
 * If the filter omits this field, the result has an empty array of elements.
 * @param parentIdentifier - The {@link TreeNodeSchemaCore.identifier | identifier} of the schema of the node that has the field.
 * @returns `false` to omit the field.
 * `true` to include the field with all of its content.
 * Otherwise, the filter to use for the fields of the nodes in this field.
 * A leaf node has no fields, so the result always includes the value of a leaf node in full.
 * @remarks
 * The export calls the filter one time for each field of each node that it visits.
 * For an array node, the export calls the filter one time, for the field that contains all the elements.
 *
 * While the filter runs, it can read the tree, but it must not edit the tree.
 * After the export returns, you can edit the tree as usual.
 *
 * The filter uses stored keys, regardless of the {@link KeyEncodingOptions} used for the keys of the tree.
 * With {@link KeyEncodingOptions.allStoredKeys}, this lets the filter also select fields that have no view schema,
 * such as the content of {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown optional fields}.
 * The other key options omit unknown optional fields before the export calls the filter.
 * @alpha
 */
export type TreeFieldFilter = (
	parentSchema: SimpleNodeSchema<SchemaType.Stored>,
	storedKey: string,
	parentIdentifier: string,
) => TreeFieldFilter | boolean;

/**
 * Options for which fields of a tree to include.
 * @alpha
 * @input
 */
export interface TreeFieldFilterOptions {
	/**
	 * Selects which fields to include.
	 * @remarks
	 * An omitted field is not in the result.
	 * For an array node, an omitted field gives an empty array of elements.
	 * This result is the same as the result for an empty array.
	 * If the field is required, the result cannot be imported again.
	 * @defaultValue All fields are included.
	 */
	readonly filter?: TreeFieldFilter;
}

/**
 * Options for how to encode keys in a tree.
 * @beta
 * @input
 */
export enum KeyEncodingOptions {
	/**
	 * Use property keys.
	 * @remarks
	 * Supported for import and export.
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields|Unknown optional fields} will be omitted when using property keys.
	 */
	usePropertyKeys = "usePropertyKeys",
	/**
	 * Use stored keys, and include {@link ObjectSchemaOptions.allowUnknownOptionalFields|Unknown optional fields}.
	 * @remarks
	 * Currently only supported for export.
	 */
	allStoredKeys = "allStoredKeys",
	/**
	 * Use stored keys but do not include {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown optional fields}.
	 * @remarks
	 * Supported for import and export.
	 * For export, this omits unknown optional fields.
	 * For import, any unexpected fields are errors, regardless of {@link ObjectSchemaOptions.allowUnknownOptionalFields}.
	 */
	knownStoredKeys = "knownStoredKeys",
}

/**
 * Options for how to interpret a `ConciseTree<TCustom>` without relying on schema.
 */
export interface SchemalessParseOptions {
	/**
	 * Converts stored keys into whatever key the tree is using in its encoding.
	 */
	keyConverter?: {
		parse(type: string, inputKey: string): FieldKey;
		encode(type: string, key: FieldKey): string;
	};
}

/**
 * Tree representation with fields as properties and customized handle and child representations.
 */
export type CustomTree<TChild> = CustomTreeNode<TChild> | CustomTreeValue;

/**
 * TreeLeafValue except the handle type is customized.
 */
export type CustomTreeValue = TreeLeafValue;

/**
 * Tree node representation with fields as properties and customized child representation.
 */
export type CustomTreeNode<TChild> = TChild[] | { [key: string]: TChild };

/**
 * Builds an {@link CustomTree} from a cursor in Nodes mode.
 *
 * @param reader - The cursor to read from.
 * @param options - Options for how to interpret the tree.
 * @param storedSchema - Schema which the cursor must comply with.
 * Must be be possible to map to a view schema (mainly that sequences can only occur in the special ArrayNode pattern).
 * Must include even unknown optional fields.
 * @param schema - View schema used to derive the property keys for fields when `options` selects them via {@link TreeEncodingOptions.useStoredKeys}.
 * @param childHandler - Function to handle children of the cursor.
 * @param filter - Selects which fields to include. If `undefined`, all fields are included.
 * @param simpleStoredSchema - The stored schema of each node type, given to `filter`. Must be provided if `filter` is provided.
 *
 * @remarks
 * This can handle unknown optional fields only because they are included in the `storedSchema` and `schema` is only needed when using property keys, which also skips unknown optional fields.
 */
export function customFromCursor<TChild>(
	reader: ITreeCursor,
	options: Required<TreeEncodingOptions>,
	storedSchema: ReadonlyMap<string, TreeNodeStoredSchema>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
	childHandler: (
		reader: ITreeCursor,
		options: Required<TreeEncodingOptions>,
		storedSchema: ReadonlyMap<string, TreeNodeStoredSchema>,
		schema: ReadonlyMap<string, TreeNodeSchema>,
		filter?: TreeFieldFilter,
		simpleStoredSchema?: ReadonlyMap<string, SimpleNodeSchema<SchemaType.Stored>>,
	) => TChild,
	filter?: TreeFieldFilter,
	simpleStoredSchema?: ReadonlyMap<string, SimpleNodeSchema<SchemaType.Stored>>,
): CustomTree<TChild> {
	const type = reader.type;

	switch (type) {
		case numberSchema.identifier:
		case booleanSchema.identifier:
		case nullSchema.identifier:
		case stringSchema.identifier: {
			assert(reader.value !== undefined, 0xa50 /* out of schema: missing value */);
			assert(!isFluidHandle(reader.value), 0xa51 /* out of schema: unexpected FluidHandle */);
			return reader.value;
		}
		case handleSchema.identifier: {
			assert(reader.value !== undefined, 0xa52 /* out of schema: missing value */);
			assert(isFluidHandle(reader.value), 0xa53 /* out of schema: expected FluidHandle */);
			return reader.value;
		}
		default: {
			assert(reader.value === undefined, 0xa54 /* out of schema: unexpected value */);
			const nodeSchema =
				storedSchema.get(type) ?? fail(0xb2e /* missing schema for type in cursor */);
			const arrayTypes = tryStoredSchemaAsArray(nodeSchema);

			if (arrayTypes === undefined) {
				const fields: Record<string, TChild> = {};
				forEachField(reader, () => {
					assert(reader.getFieldLength() === 1, 0xa19 /* invalid children number */);
					const storedKey = reader.getFieldKey();
					const key = getKeyFromOptions(options.keys, type, storedKey, schema);
					if (key === undefined) {
						// Skip unknown optional fields when using property keys or only known stored keys.
						return;
					}
					const childFilter = filterField(filter, simpleStoredSchema, storedKey, type);
					if (childFilter === false) {
						return;
					}

					reader.enterNode(0);
					fields[key] = childHandler(
						reader,
						options,
						storedSchema,
						schema,
						childFilter,
						simpleStoredSchema,
					);
					reader.exitNode();
				});
				return fields;
			} else {
				const childFilter = filterField(filter, simpleStoredSchema, EmptyKey, type);
				if (childFilter === false) {
					return [];
				}
				const fields = inCursorField(reader, EmptyKey, () =>
					mapCursorField(reader, () =>
						childHandler(
							reader,
							options,
							storedSchema,
							schema,
							childFilter,
							simpleStoredSchema,
						),
					),
				);
				return fields;
			}
		}
	}
}

/**
 * Applies `filter` to the field `storedKey` of a node.
 * @param simpleStoredSchema - The stored schema of each node type. Must be provided if `filter` is provided.
 * @returns `false` if the field is omitted.
 * Otherwise, the filter for the content of the field, or `undefined` to include all of the content.
 */
function filterField(
	filter: TreeFieldFilter | undefined,
	simpleStoredSchema: ReadonlyMap<string, SimpleNodeSchema<SchemaType.Stored>> | undefined,
	storedKey: string,
	parentIdentifier: string,
): TreeFieldFilter | false | undefined {
	if (filter === undefined) {
		return undefined;
	}
	const parentSchema = simpleStoredSchema?.get(parentIdentifier);
	assert(parentSchema !== undefined, "Missing schema for filter");
	const childFilter = filter(parentSchema, storedKey, parentIdentifier);
	return childFilter === true ? undefined : childFilter;
}

/**
 * Returns the key if one should be used, and undefined if the field should be omitted/skipped.
 *
 * @param schema - Collection of known view schema.
 * If `options` is not `KeyEncodingOptions.allStoredKeys`, this must provide the schema for the `type`.
 * Note that if using this to perform a recursive walk, and `schema` has all view schema reachable from the starting type,
 * then it should be safe to use the same schema map on every invocation since types missing from it will only be
 * encountered after traversing unknown optional fields which for which this will return undefined.
 *
 * @remarks
 * Asserts that if encountering an unknown optional field, the schema allows them.
 * This is not robustly validated in all cases: when in allStoredKeys, it is not checked
 * (since the view schema might not even be available).
 */
function getKeyFromOptions(
	options: KeyEncodingOptions,
	type: TreeNodeSchemaIdentifier,
	storedKey: FieldKey,
	schema: ReadonlyMap<string, TreeNodeSchema>,
): string | undefined {
	switch (options) {
		case KeyEncodingOptions.allStoredKeys: {
			// Since this case might be inside of an unknown optional field,
			// it must not depend on there being a view schema.
			// Fortunately, its possible to implement this case without one.
			return storedKey;
		}
		case KeyEncodingOptions.usePropertyKeys:
		case KeyEncodingOptions.knownStoredKeys: {
			// Both these cases avoid traversing into unknown optional fields,
			// so a view schema should be available.
			const viewSchema =
				schema.get(type) ?? fail(0xbff /* missing schema for type in cursor */);
			if (isObjectNodeSchema(viewSchema)) {
				const propertyKey = viewSchema.storedKeyToPropertyKey.get(storedKey);
				if (propertyKey === undefined) {
					assert(
						viewSchema.allowUnknownOptionalFields,
						0xc00 /* found unknown field where not allowed */,
					);
					// Skip unknown optional fields when using property keys or only known stored keys.
					return undefined;
				} else {
					return options === KeyEncodingOptions.usePropertyKeys ? propertyKey : storedKey;
				}
			} else {
				return storedKey;
			}
		}
		default: {
			unreachableCase(options);
		}
	}
}

/**
 * Builds an {@link CustomTree} from a cursor in Nodes mode.
 * @remarks
 * Uses stored keys and stored schema.
 */
export function customFromCursorStored<TChild>(
	reader: ITreeCursor,
	schema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	childHandler: (
		reader: ITreeCursor,
		schema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	) => TChild,
): CustomTree<TChild> {
	const type = reader.type;
	const nodeSchema = schema.get(type) ?? fail(0xb30 /* missing schema for type in cursor */);

	if (nodeSchema instanceof LeafNodeStoredSchema) {
		assert(valueSchemaAllows(nodeSchema.leafValue, reader.value), 0xa9c /* invalid value */);
		return reader.value;
	}

	assert(reader.value === undefined, 0xa9d /* out of schema: unexpected value */);

	const arrayTypes = tryStoredSchemaAsArray(nodeSchema);
	if (arrayTypes !== undefined) {
		const field = inCursorField(reader, EmptyKey, () =>
			mapCursorField(reader, () => childHandler(reader, schema)),
		);
		return field;
	}

	const fields: Record<string, TChild> = {};
	forEachField(reader, () => {
		const children = mapCursorField(reader, () => childHandler(reader, schema));
		if (children.length === 1) {
			const storedKey = reader.getFieldKey();
			// Length is checked above.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			fields[storedKey] = children[0]!;
		} else {
			assert(children.length === 0, 0xa9e /* invalid children number */);
		}
	});
	return fields;
}

/**
 * Checks if `schema` could correspond to a simple-tree array node.
 * If it is an array schema, returns the allowed types for the array field.
 * Otherwise returns `undefined`.
 * @remarks
 * If the schema was defined by the public API, this will be accurate since there is no way to define an object node with a sequence field.
 */
export function tryStoredSchemaAsArray(schema: TreeNodeStoredSchema): TreeTypeSet | undefined {
	if (schema instanceof ObjectNodeStoredSchema) {
		const empty = schema.getFieldSchema(EmptyKey);
		if (empty.kind === FieldKinds.sequence.identifier) {
			// This assert can only be hit by schema created not using the public API surface.
			// If at some point this case needs to be tolerated, it can be replaced by "return undefined"
			assert(schema.objectNodeFields.size === 1, 0xa9f /* invalid schema */);
			return empty.types;
		}
	}
}

/**
 * Options for how to transcode handles.
 * @remarks
 * Can be applied using {@link replaceHandles}.
 * @alpha
 */
export type HandleConverter<TCustom> = (data: IFluidHandle) => TCustom;

/**
 * Clones tree, replacing any handles.
 * @remarks
 * This can be useful converting data containing handles to JSON compatible formats,
 * or just asserting that data does not contain handles.
 *
 * Reversing this replacement depends on how the replacer encodes handles, and can often be impossible if the replacer
 * does not have all the necessary context to restore the handles
 * (e.g. if the handles are something insufficiently descriptive,
 * if data referenced by the handle got garbage collected,
 * if the encoded form of the handle can't be differentiated from other data,
 * or the replacer doesn't have access to the correct Fluid container to to restore them from).
 *
 * Code attempting to reverse this replacement may want to use {@link cloneWithReplacements}.
 * @alpha
 */
export function replaceHandles<T>(tree: unknown, replacer: HandleConverter<T>): unknown {
	return cloneWithReplacements(tree, "", (key, value) => {
		// eslint-disable-next-line unicorn/prefer-ternary
		if (isFluidHandle(value)) {
			return { clone: false, value: replacer(value) };
		} else {
			return { clone: true, value };
		}
	});
}

/**
 * Throws a `UsageError` indicating that a type is unknown in the current context.
 */
export function unknownTypeError(type: string): never {
	throw new UsageError(
		`Failed to parse tree due to occurrence of type ${JSON.stringify(type)} which is not defined in this context.`,
	);
}
