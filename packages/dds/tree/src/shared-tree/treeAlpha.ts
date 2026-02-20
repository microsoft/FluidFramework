/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import {
	assert,
	debugAssert,
	fail,
	unreachableCase,
} from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionSpaceCompressedId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	FluidClientVersion,
	type ICodecOptions,
	type CodecWriteOptions,
	FormatValidatorNoOp,
} from "../codec/index.js";
import {
	EmptyKey,
	keyAsDetachedField,
	rootFieldKey,
	type DetachedField,
	type FieldKey,
	type ITreeCursorSynchronous,
} from "../core/index.js";
import {
	cursorForMapTreeField,
	defaultSchemaPolicy,
	isTreeValue,
	makeFieldBatchCodec,
	mapTreeFromCursor,
	TreeCompressionStrategy,
	type FieldBatch,
	type FieldBatchEncodingContext,
	type LocalNodeIdentifier,
	type FlexTreeSequenceField,
	type FlexTreeNode,
	type Observer,
	withObservation,
	type FlexTreeHydratedContext,
} from "../feature-libraries/index.js";
import {
	asIndex,
	getKernel,
	TreeNode,
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
	applySchemaToParserOptions,
	cursorFromVerbose,
	verboseFromCursor,
	type TreeEncodingOptions,
	type VerboseTree,
	extractPersistedSchema,
	type TreeBranch,
	TreeViewConfigurationAlpha,
	getStoredKey,
	getPropertyKeyFromStoredKey,
	treeNodeApi,
	getIdentifierFromNode,
	unhydratedFlexTreeFromInsertable,
	getOrCreateNodeFromInnerNode,
	getOrCreateNodeFromInnerUnboxedNode,
	getInnerNode,
	NodeKind,
	tryGetTreeNodeForField,
	isObjectNodeSchema,
	isTreeNode,
	toInitialSchema,
	type TreeParsingOptions,
	type NodeChangedData,
	type ConciseTree,
	importConcise,
	exportConcise,
	borrowCursorFromTreeNodeOrValue,
	contentSchemaSymbol,
	type TreeNodeSchema,
	getUnhydratedContext,
	type TreeBranchAlpha,
	type TreeView,
	type TreeChangeEvents,
	type UnhydratedFlexTreeNode,
	SimpleContextSlot,
} from "../simple-tree/index.js";
import { brand, extractFromOpaque, type JsonCompatible } from "../util/index.js";

import { independentInitializedView, type ViewContent } from "./independentView.js";
import { SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";

const identifier: TreeIdentifierUtils = (node: TreeNode): string | undefined => {
	return getIdentifierFromNode(node, "uncompressed");
};

identifier.shorten = (branch: TreeBranch, nodeIdentifier: string): number | undefined => {
	assert(
		branch instanceof SchematizingSimpleTreeView,
		0xcac /* Unexpected branch implementation */,
	);
	const { nodeKeyManager } = branch;
	const localNodeKey = nodeKeyManager.tryLocalizeNodeIdentifier(nodeIdentifier);
	return localNodeKey === undefined ? undefined : extractFromOpaque(localNodeKey);
};

identifier.lengthen = (branch: TreeBranch, nodeIdentifier: number): string => {
	assert(
		branch instanceof SchematizingSimpleTreeView,
		0xcad /* Unexpected branch implementation */,
	);
	const { nodeKeyManager } = branch;
	const local = brand<LocalNodeIdentifier>(nodeIdentifier as SessionSpaceCompressedId);
	return nodeKeyManager.stabilizeNodeIdentifier(local);
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

// #region ParentObject Types

/**
 * The type of parent relationship.
 * - `"root"`: Node is at the document root
 * - `"detached"`: Node was removed from the tree but still exists in memory
 * - `"unhydrated"`: Node was created but never inserted into a document
 *
 * @alpha
 */
export type ParentType = "root" | "detached" | "unhydrated";

/**
 * Opaque object representing the parent of a node that is not a TreeNode.
 * This handles root nodes, detached nodes, and unhydrated nodes uniformly.
 *
 * @remarks
 * This is a sealed type - external implementations are not allowed.
 * Use the `type` property to determine which kind of parent this is:
 * - `"root"`: The node is at the document root.
 * - `"detached"`: The node was removed from the tree.
 * - `"unhydrated"`: The node was created but not inserted.
 *
 * This object can be passed to Tree APIs like `TreeAlpha.on()` to enable
 * unified handling of all node states.
 *
 * @sealed
 * @alpha
 */
export interface ParentObject extends ErasedBaseType<"@fluidframework/tree.ParentObject"> {
	/**
	 * The type of parent relationship this object represents.
	 */
	readonly type: ParentType;
}

/**
 * Union type for Tree.parent2() return type.
 *
 * @remarks
 * - {@link TreeNode}: The node has a regular parent node in the tree hierarchy
 * - {@link ParentObject}: The node is a root, detached, or unhydrated node
 *
 * @alpha
 */
export type TreeNodeParent = TreeNode | ParentObject;

/**
 * Represents a node that is at the root of a hydrated TreeView.
 * @internal
 */
export class RootParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public readonly type = "root" as const;

	public constructor(private readonly view: TreeView<ImplicitFieldSchema>) {
		super();
	}

	/**
	 * Gets the TreeView this root parent is associated with.
	 */
	public getView(): TreeView<ImplicitFieldSchema> {
		return this.view;
	}
}

/**
 * Represents a node that was removed from a hydrated tree but still exists in memory.
 * The node could potentially be re-inserted into the tree.
 * @internal
 */
export class DetachedParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public readonly type = "detached" as const;

	public constructor(
		private readonly context: FlexTreeHydratedContext,
		private readonly detachedField: DetachedField,
		private readonly detachedNode: TreeNode,
	) {
		super();
	}

	/**
	 * Gets the FlexTreeHydratedContext this detached parent is associated with.
	 */
	public getContext(): FlexTreeHydratedContext {
		return this.context;
	}

	/**
	 * Gets the DetachedField identifier for this detached subtree.
	 */
	public getDetachedField(): DetachedField {
		return this.detachedField;
	}

	/**
	 * Gets the detached node.
	 */
	public getDetachedNode(): TreeNode {
		return this.detachedNode;
	}
}

/**
 * Represents a node that was created but never inserted into any document.
 * @internal
 */
export class UnhydratedParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public readonly type = "unhydrated" as const;

	public constructor(
		private readonly context: UnhydratedFlexTreeNode["context"],
		private readonly unhydratedRoot: UnhydratedFlexTreeNode,
	) {
		super();
	}

	/**
	 * Gets the context for this unhydrated node.
	 */
	public getContext(): UnhydratedFlexTreeNode["context"] {
		return this.context;
	}

	/**
	 * Gets the unhydrated root node.
	 */
	public getUnhydratedRoot(): UnhydratedFlexTreeNode {
		return this.unhydratedRoot;
	}
}

/**
 * Cache for RootParent instances (one per view).
 * @remarks
 * Each TreeView has exactly one RootParent, ensuring that `parent2()` returns
 * the same RootParent instance for all root nodes of the same view.
 */
const rootParentCache = new WeakMap<TreeView<ImplicitFieldSchema>, RootParent>();

function getOrCreateRootParent(view: TreeView<ImplicitFieldSchema>): RootParent {
	let rootParent = rootParentCache.get(view);
	if (rootParent === undefined) {
		rootParent = new RootParent(view);
		rootParentCache.set(view, rootParent);
	}
	return rootParent;
}

/**
 * Cache for DetachedParent instances.
 * @remarks
 * We cache by context and detachedField to ensure that calling `parent2()` on the same
 * detached node returns the same DetachedParent instance. Each detached subtree gets
 * a unique DetachedField identifier when removed from the tree.
 */
const detachedParentCache = new WeakMap<
	FlexTreeHydratedContext,
	Map<DetachedField, DetachedParent>
>();

function getOrCreateDetachedParent(
	context: FlexTreeHydratedContext,
	detachedField: DetachedField,
	detachedNode: TreeNode,
): DetachedParent {
	let contextCache = detachedParentCache.get(context);
	if (contextCache === undefined) {
		contextCache = new Map();
		detachedParentCache.set(context, contextCache);
	}
	let detachedParent = contextCache.get(detachedField);
	if (detachedParent === undefined) {
		detachedParent = new DetachedParent(context, detachedField, detachedNode);
		contextCache.set(detachedField, detachedParent);
	}
	return detachedParent;
}

/**
 * Cache for UnhydratedParent instances.
 * @remarks
 * We cache by both context and unhydratedRoot because:
 * - Multiple unhydrated trees can share the same context (e.g., created via the same SchemaFactory)
 * - Each unhydrated root node needs its own distinct UnhydratedParent instance
 * - Using WeakMap on context allows cleanup when the context is garbage collected
 */
const unhydratedParentCache = new WeakMap<
	UnhydratedFlexTreeNode["context"],
	Map<UnhydratedFlexTreeNode, UnhydratedParent>
>();

function getOrCreateUnhydratedParent(
	context: UnhydratedFlexTreeNode["context"],
	unhydratedRoot: UnhydratedFlexTreeNode,
): UnhydratedParent {
	let contextCache = unhydratedParentCache.get(context);
	if (contextCache === undefined) {
		contextCache = new Map();
		unhydratedParentCache.set(context, contextCache);
	}
	let unhydratedParent = contextCache.get(unhydratedRoot);
	if (unhydratedParent === undefined) {
		unhydratedParent = new UnhydratedParent(context, unhydratedRoot);
		contextCache.set(unhydratedRoot, unhydratedParent);
	}
	return unhydratedParent;
}

// #endregion

/**
 * A utility interface for manipulating node identifiers.
 * @remarks
 * This provides methods to:
 *
 * - Retrieve identifiers from nodes
 * - Generate identifiers
 * - Convert between short numeric identifiers and long string identifiers
 *
 * @alpha @sealed
 */
export interface TreeIdentifierUtils {
	/**
	 * Returns the identifier of a node.
	 * @remarks
	 * This returns the node's UUID if and only if it has exactly one {@link SchemaFactory.identifier | identifier field}.
	 * If it has no identifier field, this returns undefined.
	 * If it has more than one identifier field, this throws an error.
	 * In that case, query the identifier fields directly instead.
	 *
	 * @param node - The TreeNode you want to get the identifier from,
	 */
	(node: TreeNode): string | undefined;

	/**
	 * Returns the shortened identifier as a number given a UUID known by the id compressor on the branch.
	 * @remarks
	 * If the given string is not a valid identifier and/or was not generated by the SharedTree, this will return `undefined`.
	 *
	 * See {@link TreeIdentifierUtils.getShort} for additional details about shortened identifiers.
	 *
	 * This method is the inverse of {@link TreeIdentifierUtils.lengthen}.
	 * If you shorten an identifier and then immediately pass it to {@link TreeIdentifierUtils.lengthen}, you will get the original string back.
	 *
	 * @param branch - The branch (and/or view) of the SharedTree that will perform the compression.
	 * @param nodeIdentifier - the stable identifier to be shortened.
	 */
	shorten(branch: TreeBranch, nodeIdentifier: string): number | undefined;

	/**
	 * Returns the stable id as a string if the identifier is decompressible and known by the id compressor.
	 * @remarks
	 * If the given number does not correspond to a valid identifier generated by the SharedTree, this will return `undefined`.
	 *
	 * This method is the inverse of {@link TreeIdentifierUtils.shorten}.
	 * If you lengthen an identifier and then immediately pass it to {@link TreeIdentifierUtils.shorten}, you will get the original short identifier back.
	 *
	 * @param branch - The branch (and/or view) of the SharedTree that will perform the decompression.
	 * @param nodeIdentifier - The local identifier to be lengthened.
	 */
	lengthen(branch: TreeBranch, nodeIdentifier: number): string;

	/**
	 * Returns the {@link TreeIdentifierUtils.shorten | shortened} form of the identifier {@link SchemaFactory.identifier | identifier} for the given node.
	 * @remarks
	 * If the node is {@link Unhydrated | hydrated} and its identifier is a valid UUID that was automatically generated by the SharedTree it is part of (or something else using the same {@link @fluidframework/id-compressor#IIdCompressor}), then this will return a process-unique integer corresponding to that identifier.
	 * This is useful for performance-sensitive scenarios involving many nodes with identifiers that need to be compactly retained in memory or used for efficient lookup.
	 * Note that automatically generated identifiers that were accessed before the node was hydrated will not yield a short identifier until after hydration.
	 *
	 * If the node's identifier is any other user-provided string, then this will return `undefined`.
	 *
	 * If the node has no identifier (that is, it has no {@link SchemaFactory.identifier | identifier} field), then this returns `undefined`.
	 *
	 * If the node has more than one identifier, then this will throw an error.
	 * In that case, retrieve the identifiers individually via their fields instead.
	 *
	 * The returned integer should not be serialized or preserved outside of the current process.
	 * Its lifetime is that of the current in-memory instance of the FF container for this client, and it is not guaranteed to be unique or stable outside of that context.
	 * The same node's identifier may, for example, be different across multiple sessions for the same client and document, or different across two clients in the same session.
	 */
	getShort(node: TreeNode): number | undefined;

	/**
	 * Creates a new identifier.
	 * @remarks
	 * The returned UUID string can be {@link TreeIdentifierUtils.shorten | shortened} for high-performance scenarios.
	 *
	 * @param branch - The branch (and/or view) of the SharedTree that will generate and manage the identifier.
	 */
	create(branch: TreeBranch): string;
}

/**
 * Extensions to {@link (Tree:interface)} and {@link (TreeBeta:interface)} which are not yet stable.
 * @remarks
 * Use via the {@link (TreeAlpha:variable)} singleton.
 *
 * The unhydrated node creation APIs in this interface do not support {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown optional fields}.
 * This is because unknown optional fields still must have a schema: its just that the schema may come from the document's stored schema.
 * Unhydrated nodes created via this interface are not associated with any document, so there is nowhere for them to get schema for unknown optional fields.
 * Note that {@link (TreeBeta:interface).clone} can create an unhydrated node with unknown optional fields, as it uses the source node's stored schema (if any).
 *
 * Export APIs in this interface include {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown optional fields}
 * if they are using {@link KeyEncodingOptions.allStoredKeys}.
 *
 * @privateRemarks
 * TODO:
 * There should be a way to provide a source for defaulted identifiers for unhydrated node creation, either via these APIs or some way to add them to its output later.
 * If an option were added to these APIs, it could also be used to enable unknown optional fields.
 *
 * @sealed @alpha
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
	branch(node: TreeNode): TreeBranchAlpha | undefined;

	/**
	 * Construct tree content that is compatible with the field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content.
	 * @remarks
	 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
	 * This function exists as a generalization that can be used in other cases as well,
	 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
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
	 * {@inheritDoc (TreeBeta:interface).importConcise}
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
	 * {@inheritDoc (TreeBeta:interface).(exportConcise:1)}
	 * @privateRemarks Note: this was retained on this interface because {@link (TreeAlpha:interface).importConcise} exists.
	 * It should be removed if/when that is removed from this interface.
	 */
	exportConcise(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): ConciseTree;

	/**
	 * {@inheritDoc (TreeBeta:interface).(exportConcise:2)}
	 * @privateRemarks Note: this was retained on this interface because {@link (TreeAlpha:interface).importConcise} exists.
	 * It should be removed if/when that is removed from this interface.
	 */
	exportConcise(
		node: TreeNode | TreeLeafValue | undefined,
		options?: TreeEncodingOptions,
	): ConciseTree | undefined;

	/**
	 * Construct tree content compatible with a field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content. See {@link (TreeAlpha:interface).(exportVerbose:1)}.
	 * @remarks
	 * This currently does not support input containing
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields| unknown optional fields} but does support
	 * {@link SchemaStaticsBeta.staged | staged} allowed types.
	 * Non-empty default values for fields are currently not supported (must be provided in the input).
	 * The content will be validated against the schema and an error will be thrown if out of schema.
	 */
	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: TreeParsingOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object (except for {@link @fluidframework/core-interfaces#IFluidHandle|IFluidHandles}).
	 * Uses the {@link VerboseTree} format, with an explicit type on every node.
	 *
	 * @remarks
	 * There are several cases this may be preferred to {@link (TreeBeta:interface).(exportConcise:1)}:
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
	 * See {@link KeyEncodingOptions.allStoredKeys} for details.
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
		options: { idCompressor?: IIdCompressor } & Pick<CodecWriteOptions, "minVersionForCollab">,
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
	 * If `node`'s parent is a {@link ParentObject} (root, detached, or unhydrated), this returns `undefined`.
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 *
	 * The following invariant holds for all nodes:
	 * ```
	 * TreeAlpha.child(TreeAlpha.parent2(node), TreeAlpha.key2(node)) === node
	 * ```
	 */
	key2(node: TreeNode): string | number | undefined;

	/**
	 * Gets the child of the given parent with the given property key if a child exists under that key.
	 *
	 * @remarks {@link ObjectSchemaOptions.allowUnknownOptionalFields | Unknown optional fields} of Object nodes will not be returned by this method.
	 *
	 * @param parent - The parent (TreeNode or ParentObject) whose child is being requested.
	 * @param key - The property key under the parent under which the child is being requested.
	 * For Object nodes, this is the developer-facing "property key", not the "{@link SimpleObjectFieldSchema.storedKey | stored keys}".
	 * For ParentObject parents, use `undefined` to get the root/detached/unhydrated child.
	 *
	 * @returns The child node or leaf value under the given key, or `undefined` if no such child exists.
	 *
	 * @see {@link (TreeAlpha:interface).key2}
	 * @see {@link (TreeAlpha:interface).parent2}
	 */
	child(
		parent: TreeNodeParent,
		key: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined;

	/**
	 * Gets the children of the provided parent, paired with their property keys under the parent.
	 *
	 * @remarks
	 * No guarantees are made regarding the order of the children in the returned array.
	 *
	 * Optional properties of Object nodes with no value are not included in the result.
	 *
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | Unknown optional fields} of Object nodes are not included in the result.
	 *
	 * For TreeNode parents, the key will always be `string | number` (never `undefined`).
	 *
	 * For ParentObject parents (root, detached, unhydrated), returns a single child with key `undefined`.
	 * Returns an empty array if no child exists (e.g., optional root with no value).
	 *
	 * @param parent - The parent (TreeNode or ParentObject) whose children are being requested.
	 *
	 * @returns
	 * An array of pairs of the form `[propertyKey, child]`.
	 *
	 * For Array nodes, the `propertyKey` is the index of the child in the array.
	 *
	 * For Object nodes, the returned `propertyKey`s are the developer-facing "property keys", not the "{@link SimpleObjectFieldSchema.storedKey | stored keys}".
	 *
	 * @see {@link (TreeAlpha:interface).key2}
	 * @see {@link (TreeAlpha:interface).parent2}
	 */
	children(
		parent: TreeNodeParent,
	): Iterable<[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]>;

	/**
	 * Track observations of any TreeNode content.
	 * @remarks
	 * This subscribes to changes to any nodes content observed during `trackDuring`.
	 *
	 * Currently this does not support tracking parentage (see {@link (TreeAlpha:interface).trackObservationsOnce} for a version which does):
	 * if accessing parentage during `trackDuring`, this will throw a usage error.
	 *
	 * This also does not track node status changes (e.g. whether a node is attached to a view or not).
	 * The current behavior of checking status is unspecified: future versions may track it, error, or ignore it.
	 *
	 * These subscriptions remain active until `unsubscribe` is called: `onInvalidation` may be called multiple times.
	 * See {@link (TreeAlpha:interface).trackObservationsOnce} for a version which automatically unsubscribes on the first invalidation.
	 * @privateRemarks
	 * This version, while more general than {@link (TreeAlpha:interface).trackObservationsOnce}, might be unnecessary.
	 * Maybe this should be removed and only `trackObservationsOnce` kept.
	 * Reevaluate this before stabilizing.
	 */
	trackObservations<TResult>(
		onInvalidation: () => void,
		trackDuring: () => TResult,
	): ObservationResults<TResult>;

	/**
	 * {@link (TreeAlpha:interface).trackObservations} except automatically unsubscribes when the first invalidation occurs.
	 * @remarks
	 * This also supports tracking parentage, unlike {@link (TreeAlpha:interface).trackObservations}, as long as the parent is not undefined.
	 *
	 * @example Simple cached value invalidation
	 * ```typescript
	 * // Compute and cache this "foo" value, and clear the cache when the fields read in the callback to compute it change.
	 * cachedFoo ??= TreeAlpha.trackObservationsOnce(
	 * 	() => {
	 * 		cachedFoo = undefined;
	 * 	},
	 * 	() => nodeA.someChild.bar + nodeB.someChild.baz,
	 * ).result;
	 * ```
	 *
	 * That is equivalent to doing the following:
	 * ```typescript
	 * if (cachedFoo === undefined) {
	 * 	cachedFoo = nodeA.someChild.bar + nodeB.someChild.baz;
	 * 	const invalidate = (): void => {
	 * 		cachedFoo = undefined;
	 * 		for (const u of unsubscribe) {
	 * 			u();
	 * 		}
	 * 	};
	 * 	const unsubscribe: (() => void)[] = [
	 * 		TreeBeta.on(nodeA, "nodeChanged", (data) => {
	 * 			if (data.changedProperties.has("someChild")) {
	 * 				invalidate();
	 * 			}
	 * 		}),
	 * 		TreeBeta.on(nodeB, "nodeChanged", (data) => {
	 * 			if (data.changedProperties.has("someChild")) {
	 * 				invalidate();
	 * 			}
	 * 		}),
	 * 		TreeBeta.on(nodeA.someChild, "nodeChanged", (data) => {
	 * 			if (data.changedProperties.has("bar")) {
	 * 				invalidate();
	 * 			}
	 * 		}),
	 * 		TreeBeta.on(nodeB.someChild, "nodeChanged", (data) => {
	 * 			if (data.changedProperties.has("baz")) {
	 * 				invalidate();
	 * 			}
	 * 		}),
	 * 	];
	 * }
	 * ```
	 * @example Cached derived schema property
	 * ```typescript
	 * const factory = new SchemaFactory("com.example");
	 * class Vector extends factory.object("Vector", {
	 * 	x: SchemaFactory.number,
	 * 	y: SchemaFactory.number,
	 * }) {
	 * 	#length: number | undefined = undefined;
	 * 	public length(): number {
	 * 		if (this.#length === undefined) {
	 * 			const result = TreeAlpha.trackObservationsOnce(
	 * 				() => {
	 * 					this.#length = undefined;
	 * 				},
	 * 				() => Math.hypot(this.x, this.y),
	 * 			);
	 * 			this.#length = result.result;
	 * 		}
	 * 		return this.#length;
	 * 	}
	 * }
	 * const vec = new Vector({ x: 3, y: 4 });
	 * assert.equal(vec.length(), 5);
	 * vec.x = 0;
	 * assert.equal(vec.length(), 4);
	 * ```
	 */
	trackObservationsOnce<TResult>(
		onInvalidation: () => void,
		trackDuring: () => TResult,
	): ObservationResults<TResult>;

	/**
	 * Ensures that the provided content will be interpreted as the given schema when inserting into the tree.
	 * @returns `content`, for convenience.
	 * @remarks
	 * If applicable, this will tag the given content with a {@link contentSchemaSymbol | special property} that indicates its intended schema.
	 * The `content` will be interpreted as the given `schema` when later inserted into the tree.
	 *
	 * This does not validate that the content actually conforms to the given schema (such validation will be done at insert time).
	 * If the content is not compatible with the tagged schema, an error will be thrown when the content is inserted.
	 *
	 * This is particularly useful when the content's schema cannot be inferred from its structure alone because it is compatible with multiple schemas.
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactory("example");
	 * class Dog extends sf.object("Dog", { name: sf.string() }) {}
	 * class Cat extends sf.object("Cat", { name: sf.string() }) {}
	 * class Root extends sf.object("Root", { pet: [Dog, Cat] }) {}
	 * // ...
	 * const pet = { name: "Max" };
	 * view.root.pet = pet; // Error: ambiguous schema - is it a Dog or a Cat?
	 * TreeAlpha.ensureSchema(Dog, pet); // Tags `pet` as a Dog.
	 * view.root.pet = pet; // No error - it's a Dog.
	 * ```
	 */
	tagContentSchema<TSchema extends TreeNodeSchema, TContent extends InsertableField<TSchema>>(
		schema: TSchema,
		content: TContent,
	): TContent;

	/**
	 * Retrieve the parent of the given node.
	 * @param node - The node to get the parent for.
	 * @returns The parent {@link TreeNode} if a parent node exists, or a {@link ParentObject}
	 * representing the root, detached, or unhydrated state.
	 *
	 * @remarks
	 * This method always returns a value, unlike {@link (TreeNodeApi:interface).parent} which returns
	 * undefined for root nodes. The returned value satisfies the invariant:
	 * `TreeAlpha.child(TreeAlpha.parent2(node), TreeAlpha.key2(node)) === node`
	 */
	parent2(node: TreeNode): TreeNodeParent;

	/**
	 * Register an event listener on the given parent (either a TreeNode or ParentObject).
	 *
	 * @remarks
	 * For `nodeChanged` and `treeChanged` events:
	 *
	 * - If the parent is a TreeNode, the listener is registered on that node and fires on content changes.
	 *
	 * - If the parent is a ParentObject with type `"root"`, the listener is registered on the root node of the associated TreeView and re-subscribes when the root changes. Fires on content changes.
	 *
	 * - If the parent is a ParentObject with type `"detached"`, the listener fires on status changes (re-attachment, deletion), not on content changes within the detached subtree.
	 *
	 * - If the parent is a ParentObject with type `"unhydrated"`, the listener fires on status changes (hydration), not on content changes within the unhydrated subtree.
	 */
	on<K extends keyof TreeChangeEvents>(
		parent: TreeNodeParent,
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void;
}

/**
 * Results from an operation with tracked observations.
 * @remarks
 * Results from {@link (TreeAlpha:interface).trackObservations} or {@link (TreeAlpha:interface).trackObservationsOnce}.
 * @sealed @alpha
 */
export interface ObservationResults<TResult> {
	/**
	 * The result of the operation which had its observations tracked.
	 */
	readonly result: TResult;

	/**
	 * Call to unsubscribe from further invalidations.
	 */
	readonly unsubscribe: () => void;
}

/**
 * Subscription to changes on a single node.
 * @remarks
 * Either tracks some set of fields, or all fields and can be updated to track more fields.
 */
class NodeSubscription {
	/**
	 * If undefined, subscribes to all keys.
	 * Otherwise only subscribes to the keys in the set.
	 */
	private keys: Set<FieldKey> | undefined;
	private readonly unsubscribe: () => void;
	private constructor(
		private readonly onInvalidation: () => void,
		flexNode: FlexTreeNode,
	) {
		// TODO:Performance: It is possible to optimize this to not use the public TreeNode API.
		const node = getOrCreateNodeFromInnerNode(flexNode);
		assert(node instanceof TreeNode, 0xc54 /* Unexpected leaf value */);

		const handler = (data: NodeChangedData): void => {
			if (this.keys === undefined || data.changedProperties === undefined) {
				this.onInvalidation();
			} else {
				let keyMap: ReadonlyMap<FieldKey, string> | undefined;
				const schema = treeNodeApi.schema(node);
				if (isObjectNodeSchema(schema)) {
					keyMap = schema.storedKeyToPropertyKey;
				}
				// TODO:Performance: Ideally this would use Set.prototype.isDisjointFrom when available.
				for (const flexKey of this.keys) {
					// TODO:Performance: doing everything at the flex tree layer could avoid this translation
					const key = keyMap?.get(flexKey) ?? flexKey;

					if (data.changedProperties.has(key)) {
						this.onInvalidation();
						return;
					}
				}
			}
		};
		this.unsubscribe = TreeBeta.on(node, "nodeChanged", handler);
	}

	/**
	 * Create an {@link Observer} which subscribes to what was observed in {@link NodeSubscription}s.
	 */
	public static createObserver(
		invalidate: () => void,
		onlyOnce = false,
	): { observer: Observer; unsubscribe: () => void } {
		const subscriptions = new Map<FlexTreeNode, NodeSubscription>();
		const observer: Observer = {
			observeNodeFields(flexNode: FlexTreeNode): void {
				if (flexNode.value !== undefined) {
					// Leaf value, nothing to observe.
					return;
				}
				const subscription = subscriptions.get(flexNode);
				if (subscription === undefined) {
					const newSubscription = new NodeSubscription(invalidate, flexNode);
					subscriptions.set(flexNode, newSubscription);
				} else {
					// Already subscribed to this node.
					subscription.keys = undefined; // Now subscribed to all keys.
				}
			},
			observeNodeField(flexNode: FlexTreeNode, key: FieldKey): void {
				if (flexNode.value !== undefined) {
					// Leaf value, nothing to observe.
					return;
				}
				const subscription = subscriptions.get(flexNode);
				if (subscription === undefined) {
					const newSubscription = new NodeSubscription(invalidate, flexNode);
					newSubscription.keys = new Set([key]);
					subscriptions.set(flexNode, newSubscription);
				} else {
					// Already subscribed to this node: if not subscribed to all keys, subscribe to this one.
					// TODO:Performance: due to how JavaScript set ordering works,
					// it might be faster to check `has` and only add if not present in case the same field is viewed many times.
					subscription.keys?.add(key);
				}
			},
			observeParentOf(node: FlexTreeNode): void {
				// Supporting parent tracking is more difficult that it might seem at first.
				// There are two main complicating factors:
				// 1. The parent may be undefined (the node is a root).
				// 2. If tracking this by subscribing to the parent's changes, then which events are subscribed to needs to be updated after the parent changes.
				//
				// If not supporting the first case (undefined parents), the second case gets problematic: edits which un-parent a node could error due to being unable to update the event subscription.
				// For now this is mitigated by only supporting one of tracking (non-undefined) parents or maintaining event subscriptions across edits.

				if (!onlyOnce) {
					// TODO: better APIS should be provided which make handling this case practical.
					throw new UsageError("Observation tracking for parents is currently not supported.");
				}

				const parent = withObservation(undefined, () => node.parentField.parent);

				if (parent.parent === undefined) {
					// TODO: better APIS should be provided which make handling this case practical.
					throw new UsageError(
						"Observation tracking for parents is currently not supported when parent is undefined.",
					);
				}
				observer.observeNodeField(parent.parent, parent.key);
			},
		};

		let subscribed = true;

		return {
			observer,
			unsubscribe: () => {
				if (!subscribed) {
					throw new UsageError("Already unsubscribed");
				}
				subscribed = false;
				for (const subscription of subscriptions.values()) {
					subscription.unsubscribe();
				}
			},
		};
	}
}

/**
 * Handles both {@link (TreeAlpha:interface).trackObservations} and {@link (TreeAlpha:interface).trackObservationsOnce}.
 */
function trackObservations<TResult>(
	onInvalidation: () => void,
	trackDuring: () => TResult,
	onlyOnce = false,
): ObservationResults<TResult> {
	let observing = true;

	const invalidate = (): void => {
		if (observing) {
			throw new UsageError("Cannot invalidate while tracking observations");
		}
		onInvalidation();
	};

	const { observer, unsubscribe } = NodeSubscription.createObserver(invalidate, onlyOnce);
	const result = withObservation(observer, trackDuring);
	observing = false;

	return {
		result,
		unsubscribe,
	};
}

/**
 * Extensions to {@link (Tree:variable)} and {@link (TreeBeta:variable)} which are not yet stable.
 * @see {@link (TreeAlpha:interface)}.
 * @alpha
 */
export const TreeAlpha: TreeAlpha = {
	trackObservations<TResult>(
		onInvalidation: () => void,
		trackDuring: () => TResult,
	): ObservationResults<TResult> {
		return trackObservations(onInvalidation, trackDuring);
	},

	trackObservationsOnce<TResult>(
		onInvalidation: () => void,
		trackDuring: () => TResult,
	): ObservationResults<TResult> {
		const result = trackObservations(
			() => {
				// trackObservations ensures no invalidation occurs while its running,
				// so this callback can only run after trackObservations has returns and thus result is defined.
				result.unsubscribe();
				onInvalidation();
			},
			trackDuring,
			true,
		);
		return result;
	},

	branch(node: TreeNode): TreeBranchAlpha | undefined {
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
		const mapTree = unhydratedFlexTreeFromInsertable(
			data as InsertableField<UnsafeUnknownSchema>,
			schema,
		);
		const result = mapTree === undefined ? undefined : getOrCreateNodeFromInnerNode(mapTree);
		return result as Unhydrated<
			TSchema extends ImplicitFieldSchema
				? TreeFieldFromImplicitField<TSchema>
				: TreeNode | TreeLeafValue | undefined
		>;
	},

	importConcise<const TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: ConciseTree | undefined,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	> {
		return importConcise(schema, data);
	},

	exportConcise,

	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: TreeParsingOptions,
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
		return createFromCursor(
			schema,
			cursor,
			getUnhydratedContext(schema).flexContext.schema.rootFieldSchema,
		);
	},

	exportVerbose(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): VerboseTree {
		if (isTreeValue(node)) {
			return node;
		}
		const config: TreeEncodingOptions = { ...options };

		const cursor = borrowCursorFromTreeNodeOrValue(node);
		const kernel = getKernel(node);
		return verboseFromCursor(cursor, kernel.context, config);
	},

	exportCompressed(
		node: TreeNode | TreeLeafValue,
		options: { idCompressor?: IIdCompressor } & Pick<CodecWriteOptions, "minVersionForCollab">,
	): JsonCompatible<IFluidHandle> {
		const schema = tryGetSchema(node) ?? fail(0xacf /* invalid input */);
		const codec = makeFieldBatchCodec({
			jsonValidator: FormatValidatorNoOp,
			minVersionForCollab: options.minVersionForCollab,
		});
		const cursor = borrowFieldCursorFromTreeNodeOrValue(node);
		const batch: FieldBatch = [cursor];
		// If none provided, create a compressor which will not compress anything.
		const idCompressor = options.idCompressor ?? createIdCompressor();

		// Grabbing an existing stored schema from the node is important to ensure that unknown optional fields can be preserved.
		// Note that if the node is unhydrated, this can result in all staged allowed types being included in the schema, which might be undesired.
		const storedSchema = isTreeNode(node)
			? getKernel(node).context.flexContext.schema
			: toInitialSchema(schema);

		const context: FieldBatchEncodingContext = {
			encodeType: TreeCompressionStrategy.Compressed,
			idCompressor,
			originatorId: idCompressor.localSessionId, // TODO: Why is this needed?
			schema: { schema: storedSchema, policy: defaultSchemaPolicy },
		};
		const result = codec.encode(batch, context);
		return result;
	},

	importCompressed<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		compressedData: JsonCompatible<IFluidHandle>,
		options: {
			idCompressor?: IIdCompressor;
		} & CodecWriteOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		const config = new TreeViewConfigurationAlpha({ schema });
		const content: ViewContent = {
			// Always use a v1 schema codec for consistency.
			// TODO: reevaluate how staged schema should behave in schema import/export APIs before stabilizing this.
			schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_0, () => true),
			tree: compressedData,
			idCompressor: options.idCompressor ?? createIdCompressor(),
		};
		const view = independentInitializedView(config, options, content);
		return TreeBeta.clone<TSchema>(view.root);
	},

	identifier,

	key2(node: TreeNode): string | number | undefined {
		// If the parent is undefined, then this node is under a ParentObject (root, detached, or unhydrated)
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

	child: (
		parent: TreeNodeParent,
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined => {
		// Handle ParentObject cases
		if (parent instanceof RootParent) {
			if (propertyKey !== undefined) {
				return undefined;
			}
			const view = parent.getView();
			if (!view.compatibility.canView) {
				return undefined;
			}
			const root = view.root;
			return isTreeNode(root) ? root : (root as TreeLeafValue | undefined);
		}

		if (parent instanceof DetachedParent) {
			if (propertyKey !== undefined) {
				return undefined;
			}
			return parent.getDetachedNode();
		}

		if (parent instanceof UnhydratedParent) {
			if (propertyKey !== undefined) {
				return undefined;
			}
			return parent.getUnhydratedRoot().treeNode;
		}

		if (!isTreeNode(parent)) {
			fail("Unknown ParentObject type");
		}

		// Handle TreeNode case - key must not be undefined for TreeNode parents
		if (propertyKey === undefined) {
			return undefined;
		}

		const node = parent;
		const flexNode = getInnerNode(node);
		debugAssert(
			() => !flexNode.context.isDisposed() || "The provided tree node has been disposed.",
		);

		const schema = treeNodeApi.schema(node);

		switch (schema.kind) {
			case NodeKind.Array: {
				const sequence = flexNode.tryGetField(EmptyKey) as FlexTreeSequenceField | undefined;

				// Empty sequence - cannot have children.
				if (sequence === undefined) {
					return undefined;
				}

				const index =
					typeof propertyKey === "number"
						? propertyKey
						: asIndex(propertyKey, Number.POSITIVE_INFINITY);

				// If the key is not a valid index, then there is no corresponding child.
				if (index === undefined) {
					return undefined;
				}

				const childFlexTree = sequence.at(index);

				// No child at the given index.
				if (childFlexTree === undefined) {
					return undefined;
				}

				return getOrCreateNodeFromInnerUnboxedNode(childFlexTree);
			}
			case NodeKind.Map: {
				if (typeof propertyKey !== "string") {
					// Map nodes only support string keys.
					return undefined;
				}
			}
			// Fall through
			case NodeKind.Record:
			case NodeKind.Object: {
				let storedKey: string | number = propertyKey;
				if (isObjectNodeSchema(schema)) {
					const fieldSchema = schema.fields.get(String(propertyKey));
					if (fieldSchema === undefined) {
						return undefined;
					}

					storedKey = fieldSchema.storedKey;
				}

				const field = flexNode.tryGetField(brand(String(storedKey)));
				if (field !== undefined) {
					return tryGetTreeNodeForField(field);
				}

				return undefined;
			}
			case NodeKind.Leaf: {
				fail("Leaf schema associated with non-leaf tree node.");
			}
			default: {
				unreachableCase(schema.kind);
			}
		}
	},

	children(
		parent: TreeNodeParent,
	): Iterable<[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]> {
		// Handle ParentObject cases
		if (parent instanceof RootParent) {
			const view = parent.getView();
			if (!view.compatibility.canView) {
				return [];
			}
			const root = view.root;
			return root === undefined ? [] : [[undefined, root as TreeNode | TreeLeafValue]];
		}

		if (parent instanceof DetachedParent) {
			return [[undefined, parent.getDetachedNode()]];
		}

		if (parent instanceof UnhydratedParent) {
			const treeNode = parent.getUnhydratedRoot().treeNode;
			return treeNode === undefined ? [] : [[undefined, treeNode]];
		}

		if (!isTreeNode(parent)) {
			fail("Unknown ParentObject type");
		}

		// Handle TreeNode case
		const node = parent;
		const flexNode = getInnerNode(node);
		debugAssert(
			() => !flexNode.context.isDisposed() || "The provided tree node has been disposed.",
		);

		const schema = treeNodeApi.schema(node);

		const result: [string | number | undefined, TreeNode | TreeLeafValue][] = [];
		switch (schema.kind) {
			case NodeKind.Array: {
				const sequence = flexNode.tryGetField(EmptyKey) as FlexTreeSequenceField | undefined;
				if (sequence === undefined) {
					break;
				}

				for (let index = 0; index < sequence.length; index++) {
					const childFlexTree = sequence.at(index);
					assert(childFlexTree !== undefined, 0xbc4 /* Sequence child was undefined. */);
					const childTree = getOrCreateNodeFromInnerUnboxedNode(childFlexTree);
					result.push([index, childTree]);
				}
				break;
			}
			case NodeKind.Map:
			case NodeKind.Record: {
				for (const [key, flexField] of flexNode.fields) {
					const childTreeNode = tryGetTreeNodeForField(flexField);
					if (childTreeNode !== undefined) {
						result.push([key, childTreeNode]);
					}
				}
				break;
			}
			case NodeKind.Object: {
				assert(isObjectNodeSchema(schema), 0xbc5 /* Expected object schema. */);
				for (const [propertyKey, fieldSchema] of schema.fields) {
					const storedKey = fieldSchema.storedKey;
					const flexField = flexNode.tryGetField(brand(String(storedKey)));
					if (flexField !== undefined) {
						const childTreeNode = tryGetTreeNodeForField(flexField);
						assert(
							childTreeNode !== undefined,
							0xbc6 /* Expected child tree node for field. */,
						);
						result.push([propertyKey, childTreeNode]);
					}
				}
				break;
			}
			case NodeKind.Leaf: {
				fail("Leaf schema associated with non-leaf tree node.");
			}
			default: {
				unreachableCase(schema.kind);
			}
		}
		return result;
	},

	tagContentSchema<TSchema extends TreeNodeSchema, TNode extends InsertableField<TSchema>>(
		schema: TSchema,
		node: TNode,
	): TNode {
		if (typeof node === "object" && node !== null && !isFluidHandle(node)) {
			Reflect.defineProperty(node, contentSchemaSymbol, {
				configurable: false,
				enumerable: false,
				writable: true,
				value: schema.identifier,
			});
		}
		return node;
	},

	parent2(node: TreeNode): TreeNodeParent {
		const parent = treeNodeApi.parent(node);
		if (parent !== undefined) {
			return parent;
		}

		// Node has no parent - determine the type of non-TreeNode parent
		const kernel = getKernel(node);

		if (!kernel.isHydrated()) {
			// Unhydrated node - return an UnhydratedParent
			const innerNode = getInnerNode(node) as UnhydratedFlexTreeNode;
			return getOrCreateUnhydratedParent(innerNode.context, innerNode);
		}

		// Hydrated node with no parent - check if it's at root or detached
		const anchorNode = kernel.anchorNode;
		const parentField = anchorNode.parentField;

		if (parentField === rootFieldKey) {
			// Node is at the document root
			const view = anchorNode.anchorSet.slots.get(ViewSlot);
			assert(view !== undefined, "Expected TreeView to be present in ViewSlot");
			return getOrCreateRootParent(view);
		} else {
			// Node is detached (removed from tree but not deleted)
			const detachedField = keyAsDetachedField(parentField);
			const hydratedContext = anchorNode.anchorSet.slots.get(SimpleContextSlot);
			assert(
				hydratedContext !== undefined,
				"Expected context to be present in SimpleContextSlot",
			);
			return getOrCreateDetachedParent(hydratedContext.flexContext, detachedField, node);
		}
	},

	on<K extends keyof TreeChangeEvents>(
		parent: TreeNodeParent,
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void {
		if (parent instanceof RootParent) {
			// RootParent - subscribe to the root node of the TreeView
			const view = parent.getView();

			let isSubscribed = true;
			let currentNodeUnsubscribe: (() => void) | undefined;

			// Helper function to subscribe and re-subscribe to the root node.
			const subscribeToRoot = (): void => {
				if (!isSubscribed) {
					return;
				}

				assert(
					view.compatibility.canView,
					0xa5f /* Cannot subscribe to node events on a TreeView with incompatible schema */,
				);
				const rootNode = view.root;
				// rootNode may be undefined if the root is optional.
				currentNodeUnsubscribe = isTreeNode(rootNode)
					? treeNodeApi.on(rootNode, eventName, listener)
					: undefined;
			};

			// Initial subscription
			subscribeToRoot();

			// Subscribe to rootChanged to handle cases where the root is replaced
			const unsubscribeRootChanged = view.events.on("rootChanged", () => {
				(listener as (...args: unknown[]) => void)();

				// Unsubscribe from the old root's events
				if (currentNodeUnsubscribe !== undefined) {
					currentNodeUnsubscribe();
					currentNodeUnsubscribe = undefined;
				}
				// Subscribe to the new root's events
				subscribeToRoot();
			});

			// Return a combined unsubscribe function
			return () => {
				isSubscribed = false;
				if (currentNodeUnsubscribe !== undefined) {
					currentNodeUnsubscribe();
					currentNodeUnsubscribe = undefined;
				}
				unsubscribeRootChanged();
			};
		}

		if (parent instanceof DetachedParent) {
			// DetachedParent - subscribe to status changes on the detached node
			// This fires when the node is re-attached, deleted, or becomes inaccessible
			const detachedNode = parent.getDetachedNode();
			const kernel = getKernel(detachedNode);
			const context = parent.getContext();

			// Sync the kernel's last known status to the current state before subscribing.
			// Without this, the kernel may still think the node is InDocument (from when it was
			// originally inserted), so a Removed → InDocument transition (e.g., via undo) would
			// go undetected.
			kernel.checkAndEmitStatusChange();

			// Subscribe to status changes (re-attached, deleted, etc.)
			const unsubscribeStatus = kernel.statusEvents.on("statusChanged", () => {
				// Fire the listener when status changes
				(listener as (...args: unknown[]) => void)();
			});

			// Also subscribe to afterBatch events to check for status changes
			// after any tree modification (e.g., undo that re-attaches the node).
			// This is needed because anchor events don't fire when a node's position changes.
			const unsubscribeAfterBatch = context.checkout.events.on("afterBatch", () => {
				kernel.checkAndEmitStatusChange();
			});

			return () => {
				unsubscribeStatus();
				unsubscribeAfterBatch();
			};
		}

		if (parent instanceof UnhydratedParent) {
			// UnhydratedParent - subscribe to status changes to detect hydration
			const unhydratedRoot = parent.getUnhydratedRoot();

			// Get the kernel for the unhydrated node's TreeNode (if one exists)
			// For unhydrated nodes, we need to track when they get hydrated
			const treeNode = unhydratedRoot.treeNode;
			assert(
				treeNode !== undefined,
				"UnhydratedParent should always have an associated TreeNode since parent2() creates one",
			);

			const kernel = getKernel(treeNode);

			// Subscribe to status changes (hydration)
			return kernel.statusEvents.on("statusChanged", () => {
				// Fire the listener when the node gets hydrated
				(listener as (...args: unknown[]) => void)();
			});
		}

		if (isTreeNode(parent)) {
			// Parent is a TreeNode - register event on that node
			return treeNodeApi.on(parent, eventName, listener);
		}

		fail("Unknown ParentObject type");
	},
};

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
