/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";
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

/**
 * Options for how to interpret or encode a tree when schema information is available.
 * @alpha
 */
export interface TreeEncodingOptions {
	/**
	 * If true, use the stored keys of object nodes.
	 * If false, use the property keys.
	 * @remarks
	 * Has no effect on {@link NodeKind}s other than {@link NodeKind.Object}.
	 *
	 * {@link SchemaFactoryObjectOptions.allowUnknownOptionalFields|Unknown optional field} will be omitted when using property keys.
	 * @defaultValue false.
	 * @privateRemarks
	 * TODO AB#43548:
	 * Replace this with an enum that provides three options:
	 * - `usePropertyKeys`: use property keys. Supported for import and export.
	 * - `allStoredKeys`: use stored keys, and include unknown optional fields. Supported for export only, at least for the short term.
	 * - `knownStoredKeys`: use stored keys but do not include unknown optional fields. Supported for import and export.
	 */
	readonly useStoredKeys?: boolean;
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
	) => TChild,
): CustomTree<TChild> {
	const type = reader.type;

	switch (type) {
		case numberSchema.identifier:
		case booleanSchema.identifier:
		case nullSchema.identifier:
		case stringSchema.identifier:
			assert(reader.value !== undefined, 0xa50 /* out of schema: missing value */);
			assert(!isFluidHandle(reader.value), 0xa51 /* out of schema: unexpected FluidHandle */);
			return reader.value;
		case handleSchema.identifier:
			assert(reader.value !== undefined, 0xa52 /* out of schema: missing value */);
			assert(isFluidHandle(reader.value), 0xa53 /* out of schema: expected FluidHandle */);
			return reader.value;
		default: {
			assert(reader.value === undefined, 0xa54 /* out of schema: unexpected value */);
			const nodeSchema =
				storedSchema.get(type) ?? fail(0xb2e /* missing schema for type in cursor */);
			const arrayTypes = tryStoredSchemaAsArray(nodeSchema);

			if (arrayTypes !== undefined) {
				const fields = inCursorField(reader, EmptyKey, () =>
					mapCursorField(reader, () => childHandler(reader, options, storedSchema, schema)),
				);
				return fields;
			} else {
				const fields: Record<string, TChild> = {};
				forEachField(reader, () => {
					assert(reader.getFieldLength() === 1, 0xa19 /* invalid children number */);
					const storedKey = reader.getFieldKey();
					let key: string;
					if (!options.useStoredKeys) {
						const viewSchema = schema.get(type) ?? fail("missing schema for type in cursor");
						if (isObjectNodeSchema(viewSchema)) {
							const propertyKey = viewSchema.storedKeyToPropertyKey.get(storedKey);
							if (propertyKey === undefined) {
								assert(
									viewSchema.allowUnknownOptionalFields,
									"found unknown field where not allowed",
								);
								// Skip unknown optional fields when using property keys.
								return;
							}
							key = propertyKey;
						} else {
							key = storedKey;
						}
					} else {
						key = storedKey;
					}
					reader.enterNode(0);
					fields[key] = childHandler(reader, options, storedSchema, schema);
					reader.exitNode();
				});
				return fields;
			}
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
 * Assumes `schema` corresponds to a simple-tree schema.
 * If it is an array schema, returns the allowed types for the array field.
 * Otherwise returns `undefined`.
 */
export function tryStoredSchemaAsArray(
	schema: TreeNodeStoredSchema,
): ReadonlySet<string> | undefined {
	if (schema instanceof ObjectNodeStoredSchema) {
		const empty = schema.getFieldSchema(EmptyKey);
		if (empty.kind === FieldKinds.sequence.identifier) {
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
