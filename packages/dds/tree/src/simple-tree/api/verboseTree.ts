/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import {
	aboveRootPlaceholder,
	EmptyKey,
	forEachField,
	inCursorField,
	keyAsDetachedField,
	mapCursorField,
	type FieldKey,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { brand, fail } from "../../util/index.js";
import type {
	TreeLeafValue,
	ImplicitFieldSchema,
	ImplicitAllowedTypes,
} from "../schemaTypes.js";
import { getSimpleNodeSchema, NodeKind, type TreeNodeSchema } from "../core/index.js";
import {
	isTreeValue,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
	type CursorAdapter,
} from "../../feature-libraries/index.js";
import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "../leafNodeSchema.js";
import { toFlexSchema } from "../toFlexSchema.js";
import { isObjectNodeSchema } from "../objectNodeTypes.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

/**
 * Verbose encoding of a {@link TreeNode} or {@link TreeValue}.
 * @remarks
 * This is verbose meaning that every {@link TreeNode} is a {@link VerboseTreeNode}.
 * Any IFluidHandle values have been replaced by `THandle`.
 * @privateRemarks
 * This can store all possible simple trees, but it can not store all possible trees representable by our internal representations like FlexTree and JsonableTree.
 */
export type VerboseTree<THandle = IFluidHandle> =
	| VerboseTreeNode<THandle>
	| Exclude<TreeLeafValue, IFluidHandle>
	| THandle;

/**
 * Verbose encoding of a {@link TreeNode}.
 * @remarks
 * This is verbose meaning that every {@link TreeNode} has an explicit `type` property, and `fields`.
 * This allowed VerboseTreeNode to be unambiguous regarding which type each node is without relying on symbols or hidden state.
 *
 * Any IFluidHandle values have been replaced by `THandle`. If the `THandle` is JSON compatible, then this type is JSON compatible as well.
 *
 * @privateRemarks
 * This type is only used for data which is copied into and out of the tree.
 * When being copied out, its fine to have the data be mutable since its a copy.
 *
 * When being copied in, we don't need to mutate, so we could use a readonly variant of this type.
 * however the copy in case (createFromVerbose) probably isn't harmed much by just reusing this type as is,
 * since if the caller has immutable data, TypeScript doesn't prevent assigning immutable data to a mutable type anyway.
 * Also relaxing the input methods to take readonly data would be a non-breaking change so it can be done later if desired.
 *
 * This format is simple-tree specialized alternative to {@link JsonableTree}.
 * This format allows for all simple-tree compatible trees to be represented.
 *
 * Unlike `JsonableTree`, leaf nodes are not boxed into node objects, and instead have their schema inferred from the value.
 * Additionally, sequence fields can only occur on a node that has a single sequence field (with the empty key) replicating the behavior of simple-tree ArrayNodes.
 */
export interface VerboseTreeNode<THandle = IFluidHandle> {
	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * @remarks
	 * Typically used to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 * When used with this package's schema system, it will be the {@link TreeNodeSchemaCore.identifier}.
	 */
	type: string;

	/**
	 * Content of this node.
	 * For array nodes, an array of children.
	 * For map and object nodes, an object which children under keys.
	 * @remarks
	 * For object nodes, the keys could be either the stored keys, or the property keys depending on usage.
	 */
	fields:
		| VerboseTree<THandle>[]
		| {
				[key: string]: VerboseTree<THandle>;
		  };
}

/**
 * Options for how to interpret a `VerboseTree<TCustom>` when schema information is available.
 */
export interface ParseOptions<TCustom> {
	/**
	 * Fixup custom input formats.
	 * @remarks
	 * Main usage is to handle IFluidHandles.
	 * When targeting JSON compatibility,
	 * this may be by throwing an error or including a placeholder.
	 * Since IFluidHandles are special references to FLuid data which is garbage collected when not referenced by the container for long enough,
	 * any scheme for encoding handles for storage outside the container (or in formats the container does not understand) is unreliable.
	 */
	valueConverter(data: VerboseTree<TCustom>): TreeLeafValue | VerboseTreeNode<TCustom>;
	/**
	 * If true, interpret the input keys of object nodes as stored keys.
	 * If false, interpret them as property keys.
	 * @defaultValue false.
	 */
	readonly useStoredKeys?: boolean;
}

/**
 * Options for how to interpret a `VerboseTree<TCustom>` without relying on schema.
 */
export interface SchemalessParseOptions<TCustom> {
	/**
	 * Fixup custom input formats.
	 * @remarks
	 * See note on {@link ParseOptions.valueConverter}.
	 */
	valueConverter(data: VerboseTree<TCustom>): TreeLeafValue | VerboseTreeNode<TCustom>;
	/**
	 * Converts stored keys into whatever key the tree is using in its encoding.
	 */
	keyConverter?: {
		parse(type: string, inputKey: string): FieldKey;
		encode(type: string, key: FieldKey): string;
	};
}

/**
 * Options for how to interpret a `VerboseTree<TCustom>` without relying on schema.
 */
export interface EncodeOptions<TCustom> {
	/**
	 * Fixup custom input formats.
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
 * Use info from `schema` to convert `options` to {@link SchemalessParseOptions}.
 */
export function applySchemaToParserOptions<TCustom>(
	schema: ImplicitFieldSchema,
	options: ParseOptions<TCustom>,
): SchemalessParseOptions<TCustom> {
	const config: Required<ParseOptions<TCustom>> = {
		useStoredKeys: false,
		...options,
	};

	// TODO: should provide a way to look up schema by name efficiently without converting to flex tree schema and back.
	// Maybe cache identifier->schema map on simple tree schema lazily.
	const flexSchema = toFlexSchema(schema);

	return {
		valueConverter: config.valueConverter,
		keyConverter: config.useStoredKeys
			? undefined
			: {
					encode: (type, key: FieldKey): string => {
						// translate stored key into property key.
						const flexNodeSchema =
							flexSchema.nodeSchema.get(brand(type)) ?? fail("missing schema");
						const simpleNodeSchema = getSimpleNodeSchema(flexNodeSchema);
						if (isObjectNodeSchema(simpleNodeSchema)) {
							const propertyKey = simpleNodeSchema.storedKeyToPropertyKey.get(key);
							if (propertyKey !== undefined) {
								return propertyKey;
							}
							// Looking up an out of schema key.
							// This must point to a non-existent field.
							// It's possible that the key, if we returned it unmodified, could point to some data
							// (for example if looking up a key which is a stored key already when using property keys).
							// Thus return an arbitrary key that was selected randomly, so should not exist on non-adversarial data:
							const arbitrary = "arbitrary unused key: fe71614a-bf3e-43b3-b7b0-4cef39538e90";
							assert(
								!simpleNodeSchema.storedKeyToPropertyKey.has(brand(arbitrary)),
								0xa13 /* arbitrarily selected unused key was actually used */,
							);
							return arbitrary;
						}
						return key;
					},
					parse: (type, inputKey): FieldKey => {
						const flexNodeSchema =
							flexSchema.nodeSchema.get(brand(type)) ?? fail("missing schema");
						const simpleNodeSchema = getSimpleNodeSchema(flexNodeSchema);
						if (isObjectNodeSchema(simpleNodeSchema)) {
							const info =
								simpleNodeSchema.flexKeyMap.get(inputKey) ?? fail("missing field info");
							return info.storedKey;
						}
						return brand(inputKey);
					},
				},
	};
}

/**
 * Used to read a VerboseTree as a node cursor.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single node in nodes mode.
 */
export function cursorFromVerbose<TCustom>(
	data: VerboseTree<TCustom>,
	options: SchemalessParseOptions<TCustom>,
): ITreeCursorSynchronous {
	return stackTreeNodeCursor(verboseTreeAdapter(options), data);
}

/**
 * Used to read a VerboseTree[] as a field cursor.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single field in fields mode.
 */
export function fieldCursorFromVerbose<TCustom>(
	data: VerboseTree<TCustom>[],
	options: SchemalessParseOptions<TCustom>,
): ITreeCursorSynchronous {
	return stackTreeFieldCursor(
		verboseTreeAdapter(options),
		{ type: aboveRootPlaceholder, fields: data },
		keyAsDetachedField(EmptyKey),
	);
}

function verboseTreeAdapter<TCustom>(
	options: SchemalessParseOptions<TCustom>,
): CursorAdapter<VerboseTree<TCustom>> {
	return {
		value: (input: VerboseTree<TCustom>) => {
			const node = options.valueConverter(input);
			return isTreeValue(node) ? node : undefined;
		},
		type: (input: VerboseTree<TCustom>) => {
			const node = options.valueConverter(input);
			switch (typeof node) {
				case "number":
					return numberSchema.identifier as TreeNodeSchemaIdentifier;
				case "string":
					return stringSchema.identifier as TreeNodeSchemaIdentifier;
				case "boolean":
					return booleanSchema.identifier as TreeNodeSchemaIdentifier;
				default:
					if (node === null) {
						return nullSchema.identifier as TreeNodeSchemaIdentifier;
					}
					if (isFluidHandle(node)) {
						return handleSchema.identifier as TreeNodeSchemaIdentifier;
					}
					return node.type as TreeNodeSchemaIdentifier;
			}
		},
		keysFromNode: (input: VerboseTree<TCustom>): readonly FieldKey[] => {
			const node = options.valueConverter(input);
			switch (typeof node) {
				case "object": {
					if (node === null) {
						return [];
					}
					if (isFluidHandle(node)) {
						return [];
					}
					if (Array.isArray(node.fields)) {
						return node.fields.length === 0 ? [] : [EmptyKey];
					}

					const inputKeys = Object.keys(node.fields);
					const converter = options.keyConverter;
					if (converter === undefined) {
						return inputKeys as FieldKey[];
					}
					return inputKeys.map((k) => converter.parse(node.type, k));
				}
				default:
					return [];
			}
		},
		getFieldFromNode: (
			input: VerboseTree<TCustom>,
			key: FieldKey,
		): readonly VerboseTree<TCustom>[] => {
			const node = options.valueConverter(input);
			// Object.prototype.hasOwnProperty can return true for strings (ex: with key "0"), so we have to filter them out.
			// Rather than just special casing strings, we can handle them with an early return for all primitives.
			if (typeof node !== "object") {
				return [];
			}

			if (node === null) {
				return [];
			}

			if (isFluidHandle(node)) {
				return [];
			}

			if (Array.isArray(node.fields)) {
				return key === EmptyKey ? node.fields : [];
			}

			const convertedKey =
				options.keyConverter === undefined ? key : options.keyConverter.encode(node.type, key);

			if (Object.prototype.hasOwnProperty.call(node.fields, convertedKey)) {
				const field = node.fields[convertedKey];
				return field === undefined ? [] : [field];
			}

			return [];
		},
	};
}

/**
 * Used to read a node cursor as a VerboseTree.
 */
export function verboseFromCursor<TCustom>(
	reader: ITreeCursor,
	rootSchema: ImplicitAllowedTypes,
	options: EncodeOptions<TCustom>,
): VerboseTree<TCustom> {
	const config: Required<EncodeOptions<TCustom>> = {
		useStoredKeys: false,
		...options,
	};

	const schemaMap = new Map<string, TreeNodeSchema>();
	walkFieldSchema(rootSchema, {
		node(schema) {
			schemaMap.set(schema.identifier, schema);
		},
	});

	return verboseFromCursorInner(reader, config, schemaMap);
}

function verboseFromCursorInner<TCustom>(
	reader: ITreeCursor,
	options: Required<EncodeOptions<TCustom>>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
): VerboseTree<TCustom> {
	const type = reader.type;
	const nodeSchema = schema.get(type) ?? fail("missing schema for type in cursor");

	switch (type) {
		case numberSchema.identifier:
		case booleanSchema.identifier:
		case nullSchema.identifier:
		case stringSchema.identifier:
			assert(reader.value !== undefined, 0xa14 /* out of schema: missing value */);
			assert(!isFluidHandle(reader.value), 0xa15 /* out of schema: unexpected FluidHandle */);
			return reader.value;
		case handleSchema.identifier:
			assert(reader.value !== undefined, 0xa16 /* out of schema: missing value */);
			assert(isFluidHandle(reader.value), 0xa17 /* out of schema: unexpected FluidHandle */);
			return options.valueConverter(reader.value);
		default: {
			assert(reader.value === undefined, 0xa18 /* out of schema: unexpected value */);
			if (nodeSchema.kind === NodeKind.Array) {
				const fields = inCursorField(reader, EmptyKey, () =>
					mapCursorField(reader, () => verboseFromCursorInner(reader, options, schema)),
				);
				return { type, fields };
			} else {
				const fields: Record<string, VerboseTree<TCustom>> = {};
				forEachField(reader, () => {
					const children = mapCursorField(reader, () =>
						verboseFromCursorInner(reader, options, schema),
					);
					if (children.length === 1) {
						const storedKey = reader.getFieldKey();
						const key =
							isObjectNodeSchema(nodeSchema) && !options.useStoredKeys
								? nodeSchema.storedKeyToPropertyKey.get(storedKey) ??
									fail("missing property key")
								: storedKey;
						// Length is checked above.
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						fields[key] = children[0]!;
					} else {
						assert(children.length === 0, 0xa19 /* invalid children number */);
					}
				});
				return { type, fields };
			}
		}
	}
}
