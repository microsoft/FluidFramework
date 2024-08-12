/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import type { ITreeCursorSynchronous, SchemaAndPolicy } from "../../core/index.js";
import { fail } from "../../util/index.js";
import type {
	TreeLeafValue,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "../schemaTypes.js";
import type { Unhydrated } from "../core/index.js";
import {
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	intoStoredSchema,
	mapTreeFromCursor,
	type NodeKeyManager,
} from "../../feature-libraries/index.js";
import { getOrCreateNodeFromFlexTreeNode, type InsertableContent } from "../proxies.js";
import { getOrCreateMapTreeNode } from "../../feature-libraries/index.js";
import { toFlexSchema } from "../toFlexSchema.js";
import { inSchemaOrThrow, mapTreeFromNodeData } from "../toMapTree.js";
import {
	applySchemaToParserOptions,
	cursorFromVerbose,
	type ParseOptions,
	type VerboseTree,
	type VerboseTreeNode,
} from "./verboseTree.js";

/**
 * Construct tree content compatible with a field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content.
 * @remarks
 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
 * This function exists as a generalization that can be used in other cases as well,
 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
 *
 * Like with {@link TreeNodeSchemaClass}'s constructor, its an error to provide an existing node to this API.
 * For that case, use {@link Tree.clone}.
 * @privateRemarks
 * This could be exposed as a public `Tree.create` function.
 */
export function createFromInsertable<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	data: InsertableTreeFieldFromImplicitField<TSchema>,
	context?: NodeKeyManager | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const flexSchema = toFlexSchema(schema);
	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: defaultSchemaPolicy,
		// TODO: optimize: This isn't the most efficient operation since its not cached, and has to convert all the schema.
		schema: intoStoredSchema(flexSchema),
	};

	const mapTree = mapTreeFromNodeData(
		data as InsertableContent | undefined,
		schema,
		context,
		schemaValidationPolicy,
	);
	const result =
		mapTree === undefined
			? undefined
			: createFromCursor(schema, cursorForMapTreeNode(mapTree));
	return result as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
}

/**
 * Construct tree content compatible with a field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content. See `Tree.cloneToJSONVerbose`.
 */
export function createFromVerbose<TSchema extends ImplicitFieldSchema, THandle>(
	schema: TSchema,
	data: VerboseTreeNode<THandle> | undefined,
	options: ParseOptions<THandle>,
): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

/**
 * Construct tree content compatible with a field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content. See `Tree.cloneToJSONVerbose`.
 */
export function createFromVerbose<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	data: VerboseTreeNode | undefined,
	options?: Partial<ParseOptions<IFluidHandle>>,
): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

export function createFromVerbose<TSchema extends ImplicitFieldSchema, THandle>(
	schema: TSchema,
	data: VerboseTreeNode<THandle> | undefined,
	options?: Partial<ParseOptions<THandle>>,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const config: ParseOptions<THandle> = {
		valueConverter: (input: VerboseTree<THandle>) => {
			return input as TreeLeafValue | VerboseTreeNode<THandle>;
		},
		...options,
	};
	const schemalessConfig = applySchemaToParserOptions(schema, config);
	const cursor = cursorFromVerbose(data, schemalessConfig);
	return createFromCursor(schema, cursor);
}

export function createFromCursor<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const mapTree = mapTreeFromCursor(cursor);
	const flexSchema = toFlexSchema(schema);

	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: defaultSchemaPolicy,
		// TODO: optimize: This isn't the most efficient operation since its not cached, and has to convert all the schema.
		schema: intoStoredSchema(flexSchema),
	};

	inSchemaOrThrow(schemaValidationPolicy, mapTree);

	const rootSchema = flexSchema.nodeSchema.get(cursor.type) ?? fail("missing schema");
	const mapTreeNode = getOrCreateMapTreeNode(rootSchema, mapTree);

	// TODO: ensure this works for InnerNodes to create unhydrated nodes
	const result = getOrCreateNodeFromFlexTreeNode(mapTreeNode);
	return result as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
}

// /**
//  * Like {@link Tree.create}, except deeply clones existing nodes.
//  * @remarks
//  * This only clones the persisted data associated with a node.
//  * Local state, such as properties added to customized schema classes, will not be cloned:
//  * they will be initialized however they end up after running the constructor, just like if a remote client had inserted the same nodes.
//  */
// export function clone<TSchema extends ImplicitFieldSchema>(
// 	original: TreeFieldFromImplicitField<TSchema>,
// 	options?: {
// 		/**
// 		 * If set, all identifier's in the cloned tree (See {@link SchemaFactory.identifier}) will be replaced with new ones allocated using the default identifier allocation schema.
// 		 * Otherwise any identifiers will be preserved as is.
// 		 */
// 		replaceIdentifiers?: true;
// 	},
// ): TreeFieldFromImplicitField<TSchema> {
// 	throw new Error();
// }

// /**
//  * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
//  *
//  * @remarks
//  * If the schema is compatible with {@link ITreeConfigurationOptions.preventAmbiguity}, then the returned object will be lossless and compatible with {@link Tree.create} (unless the options are used to customize it).
//  */
// export function cloneToJSON<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): JsonCompatible<T>;

// /**
//  * Same as generic overload, except leaves handles as is.
//  */
// export function cloneToJSON(
// 	node: TreeNode,
// 	options?: { handleConverter?: undefined; useStableFieldKeys?: boolean },
// ): JsonCompatible<IFluidHandle>;

// export function cloneToJSON<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter?(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): JsonCompatible<T> {
// 	throw new Error();
// }

// /**
//  * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
//  * Verbose tree format, with explicit type on every node.
//  *
//  * @remarks
//  * There are several cases this may be preferred to {@link Tree.clone}:
//  *
//  * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), {@link Tree.clone} can produce ambiguous data (the type may be unclear on some nodes).
//  * This may be a good alternative to {@link Tree.clone} since it is lossless.
//  *
//  * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
//  *
//  * 3. When easy access to the type is desired, or a more uniform simple to parse format is desired.
//  */
// export function cloneToJSONVerbose<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): VerboseTreeNode<T>;

// /**
//  * Same as generic overload, except leaves handles as is.
//  */
// export function cloneToJSONVerbose(
// 	node: TreeNode,
// 	options?: { readonly handleConverter?: undefined; readonly useStableFieldKeys?: boolean },
// ): VerboseTreeNode;

// export function cloneToJSONVerbose<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter?(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): VerboseTreeNode<T> {
// 	const config = {
// 		handleConverter(handle: IFluidHandle): T {
// 			return handle as T;
// 		},
// 		useStableFieldKeys: false,
// 		...options,
// 	};

// 	// TODO: this should probably just get a cursor to the underlying data and use that.

// 	function convertNode(n: TreeNode): VerboseTreeNode<T> {
// 		let fields: VerboseTreeNode<T>["fields"];

// 		if (n instanceof CustomArrayNodeBase) {
// 			const x = n as CustomArrayNodeBase<ImplicitAllowedTypes>;
// 			fields = Array.from(x, convertNodeOrValue);
// 		} else if ((n as TreeNode) instanceof CustomMapNodeBase) {
// 			fields = {};
// 			for (const [key, value] of n as CustomMapNodeBase<ImplicitAllowedTypes>) {
// 				fields[key] = convertNodeOrValue(value);
// 			}
// 		} else {
// 			fields = {};
// 			for (const [key, value] of n as CustomMapNodeBase<ImplicitAllowedTypes>) {
// 				fields[key] = convertNodeOrValue(value);
// 			}
// 		}

// 		return { type: n[typeNameSymbol], fields };
// 	}

// 	function convertNodeOrValue(n: TreeNode | TreeLeafValue): VerboseTree<T> {
// 		return isTreeNode(n) ? convertNode(n) : isFluidHandle(n) ? config.handleConverter(n) : n;
// 	}

// 	return convertNode(node);
// }
