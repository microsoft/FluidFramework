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
	keyAsDetachedField,
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
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
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
import { isObjectNodeSchema } from "../objectNodeTypes.js";
import {
	customFromCursor,
	replaceHandles,
	type CustomTreeNode,
	type EncodeOptions,
	type HandleConverter,
} from "./customTree.js";
import { getUnhydratedContext } from "../createContext.js";

/**
 * Verbose encoding of a {@link TreeNode} or {@link TreeLeafValue}.
 * @remarks
 * This is verbose meaning that every {@link TreeNode} is a {@link VerboseTreeNode}.
 * Any IFluidHandle values have been replaced by `THandle`.
 * @privateRemarks
 * This can store all possible simple trees,
 * but it can not store all possible trees representable by our internal representations like FlexTree and JsonableTree.
 * @alpha
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
 * Additionally, sequence fields can only occur on a node that has a single sequence field (with the empty key)
 * replicating the behavior of simple-tree ArrayNodes.
 * @alpha
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
 * Options for how to interpret a `VerboseTree` when schema information is available.
 * @alpha
 */
export interface ParseOptions {
	/**
	 * If true, interpret the input keys of object nodes as stored keys.
	 * If false, interpret them as property keys.
	 * @defaultValue false.
	 */
	readonly useStoredKeys?: boolean;
}

/**
 * Options for how to interpret a `VerboseTree` without relying on schema.
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
 * Use info from `schema` to convert `options` to {@link SchemalessParseOptions}.
 */
export function applySchemaToParserOptions(
	schema: ImplicitFieldSchema,
	options: ParseOptions,
): SchemalessParseOptions {
	const config: Required<ParseOptions> = {
		useStoredKeys: false,
		...options,
	};

	const context = getUnhydratedContext(schema);

	return {
		keyConverter: config.useStoredKeys
			? undefined
			: {
					encode: (type, key: FieldKey): string => {
						// translate stored key into property key.
						const simpleNodeSchema =
							context.schema.get(brand(type)) ?? fail(0xb39 /* missing schema */);
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
						const simpleNodeSchema =
							context.schema.get(brand(type)) ?? fail(0xb3a /* missing schema */);
						if (isObjectNodeSchema(simpleNodeSchema)) {
							const info =
								simpleNodeSchema.flexKeyMap.get(inputKey) ??
								fail(0xb3b /* missing field info */);
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
export function cursorFromVerbose(
	data: VerboseTree,
	options: SchemalessParseOptions,
): ITreeCursorSynchronous {
	return stackTreeNodeCursor(verboseTreeAdapter(options), data);
}

/**
 * Used to read a VerboseTree[] as a field cursor.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single field in fields mode.
 */
export function fieldCursorFromVerbose(
	data: VerboseTree[],
	options: SchemalessParseOptions,
): ITreeCursorSynchronous {
	return stackTreeFieldCursor(
		verboseTreeAdapter(options),
		{ type: aboveRootPlaceholder, fields: data },
		keyAsDetachedField(EmptyKey),
	);
}

function verboseTreeAdapter(options: SchemalessParseOptions): CursorAdapter<VerboseTree> {
	return {
		value: (node: VerboseTree) => {
			return isTreeValue(node) ? node : undefined;
		},
		type: (node: VerboseTree) => {
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
		keysFromNode: (node: VerboseTree): readonly FieldKey[] => {
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
		getFieldFromNode: (node: VerboseTree, key: FieldKey): readonly VerboseTree[] => {
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
export function verboseFromCursor(
	reader: ITreeCursor,
	rootSchema: ImplicitAllowedTypes,
	options: EncodeOptions,
): VerboseTree {
	const config: Required<EncodeOptions> = {
		useStoredKeys: false,
		...options,
	};

	const schemaMap = getUnhydratedContext(rootSchema).schema;

	return verboseFromCursorInner(reader, config, schemaMap);
}

function verboseFromCursorInner(
	reader: ITreeCursor,
	options: Required<EncodeOptions>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
): VerboseTree {
	const fields = customFromCursor(reader, options, schema, verboseFromCursorInner);
	const nodeSchema =
		schema.get(reader.type) ?? fail(0xb3c /* missing schema for type in cursor */);
	if (nodeSchema.kind === NodeKind.Leaf) {
		return fields as TreeLeafValue;
	}

	return {
		type: reader.type,
		fields: fields as CustomTreeNode<VerboseTree>,
	};
}

/**
 * Clones tree, replacing any handles.
 * @remarks
 * A strongly types version of {@link replaceHandles}.
 * @alpha
 */
export function replaceVerboseTreeHandles<T>(
	tree: VerboseTree,
	replacer: HandleConverter<T>,
): VerboseTree<T> {
	return replaceHandles(tree, replacer) as VerboseTree<T>;
}
