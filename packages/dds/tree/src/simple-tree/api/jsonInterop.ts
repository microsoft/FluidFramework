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
	type SchemaAndPolicy,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { brand, fail } from "../../util/index.js";
import type {
	TreeLeafValue,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "../schemaTypes.js";
import { getSimpleNodeSchema, type Unhydrated } from "../core/index.js";
import {
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	intoStoredSchema,
	isTreeValue,
	mapTreeFromCursor,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
	type CursorAdapter,
	type NodeKeyManager,
} from "../../feature-libraries/index.js";
import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "../leafNodeSchema.js";
import { getOrCreateNodeFromFlexTreeNode, type InsertableContent } from "../proxies.js";
import { getOrCreateMapTreeNode } from "../../feature-libraries/index.js";
import { toFlexSchema } from "../toFlexSchema.js";
import { inSchemaOrThrow, mapTreeFromNodeData } from "../toMapTree.js";
import { isObjectNodeSchema } from "../objectNodeTypes.js";

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
 */
export function create<TSchema extends ImplicitFieldSchema>(
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

interface ParseOptions<TCustom> {
	/**
	 * Fixup custom input formats.
	 * @remarks
	 * Main usage is translate some JSON compatible handle format into actual IFluidHandles.
	 */
	valueConverter(data: VerboseTree<TCustom>): TreeLeafValue | VerboseTreeNode<TCustom>;
	/**
	 * If true, interpret the input keys of object nodes as stable keys.
	 * If false, interpret them as api keys.
	 * @defaultValue false.
	 */
	readonly useStoredKeys?: boolean;
}

interface SchemalessParseOptions<TCustom> {
	/**
	 * Fixup custom input formats.
	 * @remarks
	 * Main usage is translate some JSON compatible handle format into actual IFluidHandles.
	 */
	valueConverter(data: VerboseTree<TCustom>): TreeLeafValue | VerboseTreeNode<TCustom>;
	/**
	 * Converts to stable key names.
	 */
	keyConverter?(type: string, inputKey: string): string;
}

function applySchemaToParserOptions<TCustom>(
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

/**
 * TODO: add ParserOptions
 */
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

/**
 * Verbose encoding of a {@link TreeNode} or {@link TreeValue}.
 * @remarks
 * This is verbose meaning that every {@link TreeNode} is a {@link VerboseTreeNode}.
 * Any IFluidHandle values have been replaced by `THandle`.
 * @public
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
 * @public
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
	 */
	fields:
		| VerboseTree<THandle>[]
		| {
				[key: string]: VerboseTree<THandle>;
		  };
}
