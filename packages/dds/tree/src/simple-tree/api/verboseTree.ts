/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import {
	aboveRootPlaceholder,
	EmptyKey,
	keyAsDetachedField,
	type FieldKey,
	type ITreeCursorSynchronous,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { brand, fail } from "../../util/index.js";
import type { TreeLeafValue, ImplicitFieldSchema } from "../schemaTypes.js";
import { getSimpleNodeSchema } from "../core/index.js";
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

/**
 * Verbose encoding of a {@link TreeNode} or {@link TreeValue}.
 * @remarks
 * This is verbose meaning that every {@link TreeNode} is a {@link VerboseTreeNode}.
 * Any IFluidHandle values have been replaced by `THandle`.
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
	 * Typically used to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
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
	 * Main usage is translate some JSON compatible handle format into actual IFluidHandles.
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
	 * Main usage is translate some JSON compatible handle format into actual IFluidHandles.
	 */
	valueConverter(data: VerboseTree<TCustom>): TreeLeafValue | VerboseTreeNode<TCustom>;
	/**
	 * Converts to stored keys.
	 */
	keyConverter?(type: string, inputKey: string): string;
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
			: (type, inputKey) => {
					const flexNodeSchema =
						flexSchema.nodeSchema.get(brand(type)) ?? fail("missing schema");
					const simpleNodeSchema = getSimpleNodeSchema(flexNodeSchema);
					if (isObjectNodeSchema(simpleNodeSchema)) {
						const info =
							simpleNodeSchema.flexKeyMap.get(inputKey) ?? fail("missing field info");
						return info.storedKey;
					}
					return inputKey;
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
					if (options.keyConverter === undefined) {
						return inputKeys as FieldKey[];
					}
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					return inputKeys.map((k) => brand(options.keyConverter!(node.type, k)));
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

			if (Object.prototype.hasOwnProperty.call(node, key)) {
				const field = node.fields[key];
				return field === undefined ? [] : [field];
			}

			return [];
		},
	};
}
