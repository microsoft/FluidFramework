/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert, fail } from "@fluidframework/core-utils/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	getKernel,
	type TreeNode,
	type Unhydrated,
	TreeBeta,
	tryGetSchema,
	createFromCursor,
	FieldKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type TreeFieldFromImplicitField,
	type TreeLeafValue,
	type UnsafeUnknownSchema,
	conciseFromCursor,
	type ConciseTree,
	applySchemaToParserOptions,
	cursorFromVerbose,
	verboseFromCursor,
	type TreeEncodingOptions,
	type VerboseTree,
	toStoredSchema,
	extractPersistedSchema,
	type TreeBranch,
	TreeViewConfigurationAlpha,
	getStoredKey,
	getPropertyKeyFromStoredKey,
	treeNodeApi,
	getIdentifierFromNode,
	mapTreeFromNodeData,
	getOrCreateInnerNode,
	getStoredKeyFromPropertyKey,
	NodeKind,
	getTreeNodeForField,
} from "../simple-tree/index.js";
import { brand, extractFromOpaque, type JsonCompatible } from "../util/index.js";
import { noopValidator, type FluidClientVersion, type ICodecOptions } from "../codec/index.js";
import type { ITreeCursorSynchronous } from "../core/index.js";
import {
	cursorForMapTreeField,
	defaultSchemaPolicy,
	isTreeValue,
	makeFieldBatchCodec,
	mapTreeFromCursor,
	TreeCompressionStrategy,
	type FieldBatch,
	type FieldBatchEncodingContext,
	fluidVersionToFieldBatchCodecWriteVersion,
	type LocalNodeIdentifier,
} from "../feature-libraries/index.js";
import { independentInitializedView, type ViewContent } from "./independentView.js";
import { SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";
import { currentVersion } from "../codec/index.js";
import { createFromMapTree } from "../simple-tree/index.js";

const identifier: TreeIdentifierUtils = (node: TreeNode): string | undefined => {
	const nodeIdentifier = getIdentifierFromNode(node, "uncompressed");
	if (typeof nodeIdentifier === "number") {
		throw new TypeError("identifier should be uncompressed.");
	}
	return nodeIdentifier;
};

identifier.shorten = (branch: TreeBranch, nodeIdentifier: string): number | undefined => {
	const nodeKeyManager = (branch as SchematizingSimpleTreeView<ImplicitFieldSchema>)
		.nodeKeyManager;
	const localNodeKey = nodeKeyManager.tryLocalizeNodeIdentifier(nodeIdentifier);
	return localNodeKey !== undefined ? extractFromOpaque(localNodeKey) : undefined;
};

identifier.lengthen = (branch: TreeBranch, nodeIdentifier: number): string => {
	const nodeKeyManager = (branch as SchematizingSimpleTreeView<ImplicitFieldSchema>)
		.nodeKeyManager;
	return nodeKeyManager.stabilizeNodeIdentifier(
		nodeIdentifier as unknown as LocalNodeIdentifier,
	);
};

identifier.getShort = (node: TreeNode): number | undefined => {
	const shortIdentifier = getIdentifierFromNode(node, "compressed");
	return typeof shortIdentifier === "number" ? shortIdentifier : undefined;
};

identifier.create = (branch: TreeBranch): string => {
	const nodeKeyManager = (branch as SchematizingSimpleTreeView<ImplicitFieldSchema>)
		.nodeKeyManager;
	return nodeKeyManager.stabilizeNodeIdentifier(nodeKeyManager.generateLocalNodeIdentifier());
};

Object.freeze(identifier);

/**
 * A utility interface for retrieving or converting node identifiers.
 *
 * @remarks
 * This provides methods to:
 *
 * - Retrieve long or short identifiers from nodes
 *
 * - Convert between long identifiers and short identifiers
 *
 * - Generates long identifiers
 *
 * @alpha @sealed
 */
export interface TreeIdentifierUtils {
	/**
	 * Returns the contents of a node's {@link SchemaFactory.identifier} field as a stable identifier.
	 * If the identifier field does not exist, returns undefined.
	 *
	 * @param node - The TreeNode you want to get the identifier from,
	 */
	(node: TreeNode): string | undefined;

	/**
	 * Returns the shortened identifier as a number given long identifier known by the id compressor on the branch if possible.
	 * Otherwise, it will return the original string identifier provided.
	 * If the id does not exist, or is unknown by the id compressor, it returns undefined.
	 *
	 * This method is the inverse of {@link TreeIdentifierUtils.lengthen}. If you shorten an identifier
	 * and then immediately pass it to {@link TreeIdentifierUtils.lengthen}, you will get the original string back.
	 *
	 * @param branch - TreeBranch from where you get the idCompressor to do the decompression.
	 * @param nodeIdentifier - the stable identifier that needs to be shortened.
	 */
	shorten(branch: TreeBranch, nodeIdentifier: string): number | undefined;

	/**
	 * Returns the stable id as a string if the identifier is decompressible and known by the id compressor. Otherwise, it will throw an error.
	 *
	 * This method is the inverse of {@link TreeIdentifierUtils.shorten}. If you lengthen an identifier
	 * and then immediately pass it to {@link TreeIdentifierUtils.shorten}, you will get the original short identifier back.
	 *
	 * @param branch - TreeBranch from where you want to get the id compressor to do the decompression.
	 * @param nodeIdentifier - The local identifier that needs to be expanded.
	 */
	lengthen(branch: TreeBranch, nodeIdentifier: number): string;

	/**
	 * Returns the {@link SchemaFactory.identifier | identifier} of the given node in the most compressed form possible.
	 * @remarks
	 * If the node is {@link Unhydrated | hydrated} and its identifier is a valid UUID that was automatically generated by the SharedTree it is part of (or something else using the same {@link @fluidframework/id-compressor#IIdCompressor}), then this will return a process-unique integer corresponding to that identifier.
	 * This is useful for performance-sensitive scenarios involving many nodes with identifiers that need to be compactly retained in memory or used for efficient lookup.
	 * Note that automatically generated identifiers that were accessed before the node was hydrated will return the generated UUID, not the process-unique integer.
	 *
	 * If the node's identifier is any other user-provided string, then this will return undefined.
	 *
	 * If the node has no identifier (that is, it has no {@link SchemaFactory.identifier | identifier} field), then this returns `undefined`.
	 *
	 * If the node has more than one identifier, then this will throw an error.
	 *
	 * The returned integer should not be serialized or preserved outside of the current process.
	 * Its lifetime is that of the current in-memory instance of the FF container for this client, and it is not guaranteed to be unique or stable outside of that context.
	 * The same node's identifier may, for example, be different across multiple sessions for the same client and document, or different across two clients in the same session.
	 */
	getShort(node: TreeNode): number | undefined;

	/**
	 * Creates and returns a long identifier.
	 * The long identifier is a compressible, stable identifier generated by the tree's ID compressor.
	 *
	 * @param branch - TreeBranch from where you want to get the id compressor to generate the identifier from.
	 */
	create(branch: TreeBranch): string;
}

/**
 * Extensions to {@link (Tree:interface)} and {@link (TreeBeta:interface)} which are not yet stable.
 * @remarks
 * Use via the {@link (TreeAlpha:variable)} singleton.
 * @system @sealed @alpha
 */
export interface TreeAlpha {
	/**
	 * Retrieve the {@link TreeBranch | branch}, if any, for the given node.
	 * @param node - The node to query
	 * @remarks If the node has already been inserted into the tree, this will return the branch associated with that node's {@link TreeView | view}.
	 * Otherwise, it will return `undefined` (because the node has not yet been inserted and is therefore not part of a branch or view).
	 *
	 * This does not fork a new branch, but rather retrieves the _existing_ branch for the node.
	 * To create a new branch, use e.g. {@link TreeBranch.fork | `myBranch.fork()`}.
	 */
	branch(node: TreeNode): TreeBranch | undefined;

	/**
	 * Construct tree content that is compatible with the field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content.
	 * @remarks
	 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
	 * This function exists as a generalization that can be used in other cases as well,
	 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
	 * @privateRemarks
	 * There should be a way to provide a source for defaulted identifiers, either via this API or some way to add them to its output later.
	 */
	create<const TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: InsertableField<TSchema>,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	>;

	/**
	 * Less type safe version of {@link (TreeAlpha:interface).create}, suitable for importing data.
	 * @remarks
	 * Due to {@link ConciseTree} relying on type inference from the data, its use is somewhat limited.
	 * This does not support {@link ConciseTree|ConciseTrees} with customized handle encodings or using persisted keys.
	 * Use "compressed" or "verbose" formats for more flexibility.
	 *
	 * When using this function,
	 * it is recommend to ensure your schema is unambiguous with {@link ITreeConfigurationOptions.preventAmbiguity}.
	 * If the schema is ambiguous, consider using {@link (TreeAlpha:interface).create} and {@link Unhydrated} nodes where needed,
	 * or using {@link (TreeAlpha:interface).(importVerbose:1)} and specify all types.
	 *
	 * Documented (and thus recoverable) error handling/reporting for this is not yet implemented,
	 * but for now most invalid inputs will throw a recoverable error.
	 */
	importConcise<const TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: ConciseTree | undefined,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	>;

	/**
	 * Construct tree content compatible with a field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content. See {@link (TreeAlpha:interface).(exportVerbose:1)}.
	 */
	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: Partial<TreeEncodingOptions>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}.
	 */
	exportConcise(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): ConciseTree;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}, allowing undefined.
	 */
	exportConcise(
		node: TreeNode | TreeLeafValue | undefined,
		options?: TreeEncodingOptions,
	): ConciseTree | undefined;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object (except for {@link @fluidframework/core-interfaces#IFluidHandle|IFluidHandles}).
	 * Uses the {@link VerboseTree} format, with an explicit type on every node.
	 *
	 * @remarks
	 * There are several cases this may be preferred to {@link (TreeAlpha:interface).(exportConcise:1)}:
	 *
	 * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), `exportConcise` can produce ambiguous data (the type may be unclear on some nodes).
	 * `exportVerbose` will always be unambiguous and thus lossless.
	 *
	 * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
	 *
	 * 3. When easy access to the type is desired.
	 */
	exportVerbose(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): VerboseTree;

	/**
	 * Export the content of the provided `tree` in a compressed JSON compatible format.
	 * @remarks
	 * If an `idCompressor` is provided, it will be used to compress identifiers and thus will be needed to decompress the data.
	 *
	 * Always uses "stored" keys.
	 * See {@link TreeEncodingOptions.useStoredKeys} for details.
	 * @privateRemarks
	 * TODO: It is currently not clear how to work with the idCompressors correctly in the package API.
	 * Better APIs should probably be provided as there is currently no way to associate an un-hydrated tree with an idCompressor,
	 * Nor get the correct idCompressor from a subtree to use when exporting it.
	 * Additionally using `createIdCompressor` to make an idCompressor is `@legacy` and thus not intended for use in this API surface.
	 * It would probably make more sense if we provided a way to get an idCompressor from the context of a node,
	 * which could be optional (and settable if missing) for un0hydrated nodes and required for hydrated ones.
	 * Add in a stable public API for creating idCompressors, and a way to get them from a tree (without view schema), and that should address the anticipated use-cases.
	 */
	exportCompressed(
		tree: TreeNode | TreeLeafValue,
		options: { oldestCompatibleClient: FluidClientVersion; idCompressor?: IIdCompressor },
	): JsonCompatible<IFluidHandle>;

	/**
	 * Import data encoded by {@link (TreeAlpha:interface).exportCompressed}.
	 *
	 * @param schema - Schema with which the data must be compatible. This compatibility is not verified and must be ensured by the caller.
	 * @param compressedData - Data compressed by {@link (TreeAlpha:interface).exportCompressed}.
	 * @param options - If {@link (TreeAlpha:interface).exportCompressed} was given an `idCompressor`, it must be provided here.
	 *
	 * @remarks
	 * If the data could have been encoded with a different schema, consider encoding the schema along side it using {@link extractPersistedSchema} and loading the data using {@link independentView}.
	 *
	 * @privateRemarks
	 * This API could be improved:
	 *
	 * 1. It could validate that the schema is compatible, and return or throw an error in the invalid case (maybe add a "try" version).
	 *
	 * 2. A "try" version of this could return an error if the data isn't in a supported format (as determined by version and/or JasonValidator).
	 *
	 * 3. Requiring the caller provide a JsonValidator isn't the most friendly API. It might be practical to provide a default.
	 */
	importCompressed<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		compressedData: JsonCompatible<IFluidHandle>,
		options: { idCompressor?: IIdCompressor } & ICodecOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * APIs for creating, converting, and retrieving identifiers.
	 */
	readonly identifier: TreeIdentifierUtils;

	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link (TreeArrayNode:interface)}, this returns the index of `node` in the array node (a `number`).
	 * If `node` is the root node, this returns undefined.
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	key2(node: TreeNode): string | number | undefined;

	/**
	 * Gets the child of the given node with the given key if a child exists under that key.
	 *
	 * @param node - The parent node whose child is being requested.
	 * @param key - The key under the node under which the child is being requested.
	 *
	 * @returns The child node or leaf value under the given key, or `undefined` if no such child exists.
	 */
	child(node: TreeNode, key: string | number): TreeNode | TreeLeafValue | undefined;

	/**
	 * Gets the children of the provided node, paired with their key under the node.
	 *
	 * @param node - The node whose children are being requested.
	 *
	 * @returns
	 * An iterable of pairs of the form `[key, child]`, where `key` is the key under the node, and `child`
	 * is the child node or leaf value under that key.
	 */
	children(node: TreeNode): Iterable<[string | number, TreeNode | TreeLeafValue]>;
}

/**
 * Extensions to {@link (Tree:variable)} and {@link (TreeBeta:variable)} which are not yet stable.
 * @see {@link (TreeAlpha:interface)}.
 * @alpha
 */
export const TreeAlpha: TreeAlpha = {
	branch(node: TreeNode): TreeBranch | undefined {
		const kernel = getKernel(node);
		if (!kernel.isHydrated()) {
			return undefined;
		}
		const view = kernel.anchorNode.anchorSet.slots.get(ViewSlot);
		assert(
			view instanceof SchematizingSimpleTreeView,
			0xa5c /* Unexpected view implementation */,
		);
		return view;
	},

	create<const TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: InsertableField<TSchema>,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	> {
		const mapTree = mapTreeFromNodeData(data as InsertableField<UnsafeUnknownSchema>, schema);
		const result = mapTree === undefined ? undefined : createFromMapTree(schema, mapTree);
		return result as Unhydrated<
			TSchema extends ImplicitFieldSchema
				? TreeFieldFromImplicitField<TSchema>
				: TreeNode | TreeLeafValue | undefined
		>;
	},

	importConcise<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: ConciseTree | undefined,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	> {
		// `importConcise` does not need to support all the formats that `create` does.
		// Perhaps it should error instead of hydrating nodes for example.
		// For now however, it is a simple wrapper around `create`.
		return this.create(schema, data as InsertableField<TSchema>);
	},

	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: TreeEncodingOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		const config: TreeEncodingOptions = { ...options };
		// Create a config which is standalone, and thus can be used without having to refer back to the schema.
		const schemalessConfig = applySchemaToParserOptions(schema, config);
		if (data === undefined) {
			const field = normalizeFieldSchema(schema);
			if (field.kind !== FieldKind.Optional) {
				throw new UsageError("undefined provided for non-optional field.");
			}
			return undefined as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
		}
		const cursor = cursorFromVerbose(data, schemalessConfig);
		return createFromCursor(schema, cursor);
	},

	exportConcise,

	exportVerbose(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): VerboseTree {
		const config: TreeEncodingOptions = { ...options };

		const cursor = borrowCursorFromTreeNodeOrValue(node);
		return verboseFromCursor(
			cursor,
			tryGetSchema(node) ?? fail(0xace /* invalid input */),
			config,
		);
	},

	exportCompressed(
		node: TreeNode | TreeLeafValue,
		options: {
			oldestCompatibleClient: FluidClientVersion;
			idCompressor?: IIdCompressor;
		},
	): JsonCompatible<IFluidHandle> {
		const schema = tryGetSchema(node) ?? fail(0xacf /* invalid input */);
		const format = fluidVersionToFieldBatchCodecWriteVersion(options.oldestCompatibleClient);
		const codec = makeFieldBatchCodec({ jsonValidator: noopValidator }, format);
		const cursor = borrowFieldCursorFromTreeNodeOrValue(node);
		const batch: FieldBatch = [cursor];
		// If none provided, create a compressor which will not compress anything.
		const idCompressor = options.idCompressor ?? createIdCompressor();
		const context: FieldBatchEncodingContext = {
			encodeType: TreeCompressionStrategy.Compressed,
			idCompressor,
			originatorId: idCompressor.localSessionId, // TODO: Why is this needed?
			schema: { schema: toStoredSchema(schema), policy: defaultSchemaPolicy },
		};
		const result = codec.encode(batch, context);
		return result;
	},

	importCompressed<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		compressedData: JsonCompatible<IFluidHandle>,
		options: {
			idCompressor?: IIdCompressor;
		} & ICodecOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		const config = new TreeViewConfigurationAlpha({ schema });
		const content: ViewContent = {
			schema: extractPersistedSchema(config, currentVersion),
			tree: compressedData,
			idCompressor: options.idCompressor ?? createIdCompressor(),
		};
		const view = independentInitializedView(config, options, content);
		return TreeBeta.clone<TSchema>(view.root);
	},

	identifier,

	key2(node: TreeNode): string | number | undefined {
		// If the parent is undefined, then this node is under the root field,
		const parent = treeNodeApi.parent(node);
		if (parent === undefined) {
			return undefined;
		}

		// The flex-domain strictly operates in terms of "stored keys".
		// To find the associated developer-facing "property key", we need to look up the field associated with
		// the stored key from the flex-domain, and get property key its simple-domain counterpart was created with.
		const storedKey = getStoredKey(node);
		const parentSchema = treeNodeApi.schema(parent);
		return getPropertyKeyFromStoredKey(parentSchema, storedKey);
	},

	child: (node: TreeNode, key: string | number): TreeNode | TreeLeafValue | undefined => {
		const flexNode = getOrCreateInnerNode(node);
		debugAssert(() => !flexNode.context.isDisposed() || "FlexTreeNode is disposed");

		const schema = treeNodeApi.schema(node);
		const storedKey = getStoredKeyFromPropertyKey(schema, key);

		if (schema.kind === NodeKind.Array) {
			throw new Error("TODO");
		}

		assert(
			typeof storedKey === "string",
			"Expected storedKey to be a string for non-array nodes",
		);

		const field = flexNode.tryGetField(brand(storedKey));
		if (field !== undefined) {
			return getTreeNodeForField(field);
		}

		return undefined;
	},

	children: (node: TreeNode): Iterable<[string | number, TreeNode | TreeLeafValue]> => {
		const flexNode = getOrCreateInnerNode(node);
		debugAssert(() => !flexNode.context.isDisposed() || "FlexTreeNode is disposed");

		const schema = treeNodeApi.schema(node);

		if (schema.kind === NodeKind.Array) {
			throw new Error("TODO");
		}

		const result: [string | number, TreeNode | TreeLeafValue][] = [];
		for (const field of flexNode.boxedIterator()) {
			const propertyKey = getPropertyKeyFromStoredKey(schema, field.key);
			const childNode = getTreeNodeForField(field);
			if (childNode !== undefined) {
				result.push([propertyKey, childNode]);
			}
		}
		return result;
	},
};

function exportConcise(
	node: TreeNode | TreeLeafValue,
	options?: TreeEncodingOptions,
): ConciseTree;

function exportConcise(
	node: TreeNode | TreeLeafValue | undefined,
	options?: TreeEncodingOptions,
): ConciseTree | undefined;

function exportConcise(
	node: TreeNode | TreeLeafValue | undefined,
	options?: TreeEncodingOptions,
): ConciseTree | undefined {
	if (node === undefined) {
		return undefined;
	}
	const config: TreeEncodingOptions = { ...options };

	const cursor = borrowCursorFromTreeNodeOrValue(node);
	return conciseFromCursor(
		cursor,
		tryGetSchema(node) ?? fail(0xacd /* invalid input */),
		config,
	);
}

/**
 * Borrow a cursor from a node.
 * @remarks
 * The cursor must be put back to its original location before the node is used again.
 */
function borrowCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	if (isTreeValue(node)) {
		return cursorFromVerbose(node, {});
	}
	const kernel = getKernel(node);
	const cursor = kernel.getOrCreateInnerNode().borrowCursor();
	return cursor;
}

/**
 * Borrow a cursor from a field.
 * @remarks
 * The cursor must be put back to its original location before the node is used again.
 */
function borrowFieldCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue | undefined,
): ITreeCursorSynchronous {
	if (node === undefined) {
		return cursorForMapTreeField([]);
	}
	const cursor = borrowCursorFromTreeNodeOrValue(node);
	// TODO: avoid copy: borrow cursor from field instead.
	const mapTree = mapTreeFromCursor(cursor);
	return cursorForMapTreeField([mapTree]);
}
