/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	forEachField,
	inCursorField,
	LeafNodeStoredSchema,
	mapCursorField,
	ObjectNodeStoredSchema,
	type ITreeCursor,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
} from "../../core/index.js";
import { fail } from "../../util/index.js";
import type { TreeLeafValue } from "../schemaTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "../leafNodeSchema.js";
import { isObjectNodeSchema } from "../objectNodeTypes.js";
import { FieldKinds, valueSchemaAllows } from "../../feature-libraries/index.js";

/**
 * Options for how to encode a tree.
 * @alpha
 */
export interface EncodeOptions<TCustom> {
	/**
	 * How to encode any {@link @fluidframework/core-interfaces#IFluidHandle|IFluidHandles} in the tree.
	 * @remarks
	 * See note on {@link ParseOptions.valueConverter}.
	 */
	valueConverter(data: IFluidHandle): TCustom;
	/**
	 * If true, interpret the input keys of object nodes as stored keys.
	 * If false, interpret them as property keys.
	 * @defaultValue false.
	 */
	readonly useStoredKeys?: boolean;
}

/**
 * Tree representation with fields as properties and customized handle and child representations.
 */
export type CustomTree<TChild, THandle> = CustomTreeNode<TChild> | CustomTreeValue<THandle>;

/**
 * TreeLeafValue except the handle type is customized.
 */
export type CustomTreeValue<THandle> = Exclude<TreeLeafValue, IFluidHandle> | THandle;

/**
 * Tree node representation with fields as properties and customized child representation.
 */
export type CustomTreeNode<TChild> = TChild[] | { [key: string]: TChild };

/**
 * Builds an {@link CustomTree} from a cursor in Nodes mode.
 */
export function customFromCursor<TChild, THandle>(
	reader: ITreeCursor,
	options: Required<EncodeOptions<THandle>>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
	childHandler: (
		reader: ITreeCursor,
		options: Required<EncodeOptions<THandle>>,
		schema: ReadonlyMap<string, TreeNodeSchema>,
	) => TChild,
): CustomTree<TChild, THandle> {
	const type = reader.type;
	const nodeSchema = schema.get(type) ?? fail(0xb2e /* missing schema for type in cursor */);

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
			return options.valueConverter(reader.value);
		default: {
			assert(reader.value === undefined, 0xa54 /* out of schema: unexpected value */);
			if (nodeSchema.kind === NodeKind.Array) {
				const fields = inCursorField(reader, EmptyKey, () =>
					mapCursorField(reader, () => childHandler(reader, options, schema)),
				);
				return fields;
			} else {
				const fields: Record<string, TChild> = {};
				forEachField(reader, () => {
					const children = mapCursorField(reader, () => childHandler(reader, options, schema));
					if (children.length === 1) {
						const storedKey = reader.getFieldKey();
						const key =
							isObjectNodeSchema(nodeSchema) && !options.useStoredKeys
								? (nodeSchema.storedKeyToPropertyKey.get(storedKey) ??
									fail(0xb2f /* missing property key */))
								: storedKey;
						// Length is checked above.
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						fields[key] = children[0]!;
					} else {
						assert(children.length === 0, 0xa19 /* invalid children number */);
					}
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
): CustomTree<TChild, IFluidHandle> {
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
