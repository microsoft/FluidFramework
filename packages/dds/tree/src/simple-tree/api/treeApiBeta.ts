/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getKernel,
	isTreeNode,
	type NodeKind,
	type TreeChangeEvents,
	type TreeNode,
	type Unhydrated,
	type WithType,
} from "../core/index.js";
import { treeNodeApi, tryGetSchema } from "./treeNodeApi.js";
import { createFromCursor, createFromInsertable, cursorFromInsertable } from "./create.js";
import type {
	ImplicitFieldSchema,
	InsertableField,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
	TreeLeafValue,
	UnsafeUnknownSchema,
} from "../schemaTypes.js";
import { conciseFromCursor, type ConciseTree } from "./conciseTree.js";
import {
	applySchemaToParserOptions,
	cursorFromVerbose,
	verboseFromCursor,
	type ParseOptions,
	type VerboseTree,
	type VerboseTreeNode,
} from "./verboseTree.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { fail, type JsonCompatible } from "../../util/index.js";
import { noopValidator, type FluidClientVersion } from "../../codec/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { ITreeCursorSynchronous } from "../../core/index.js";
import {
	cursorForMapTreeField,
	defaultSchemaPolicy,
	isTreeValue,
	makeFieldBatchCodec,
	mapTreeFromCursor,
	TreeCompressionStrategy,
	type FieldBatch,
	type FieldBatchEncodingContext,
} from "../../feature-libraries/index.js";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { toStoredSchema } from "../toFlexSchema.js";
import type { EncodeOptions } from "./customTree.js";

/**
 * Data included for {@link TreeChangeEventsBeta.nodeChanged}.
 * @sealed @beta
 */
export interface NodeChangedData<TNode extends TreeNode = TreeNode> {
	/**
	 * When the node changed is an object or Map node, this lists all the properties which changed.
	 * @remarks
	 * This only includes changes to the node itself (which would trigger {@link TreeChangeEvents.nodeChanged}).
	 *
	 * Set to `undefined` when the {@link NodeKind} does not support this feature (currently just ArrayNodes).
	 *
	 * When defined, the set should never be empty, since `nodeChanged` will only be triggered when there is a change, and for the supported node types, the only things that can change are properties.
	 */
	readonly changedProperties?: ReadonlySet<
		// For Object nodes, make changedProperties required and strongly typed with the property names from the schema:
		TNode extends WithType<string, NodeKind.Object, infer TInfo>
			? string & keyof TInfo
			: string
	>;
}

/**
 * Extensions to {@link TreeChangeEvents} which are not yet stable.
 *
 * @sealed @beta
 */
export interface TreeChangeEventsBeta<TNode extends TreeNode = TreeNode>
	extends TreeChangeEvents {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if any of the changes affected the node.
	 *
	 * - Object nodes define a change as being when the value of one of its properties changes (i.e., the property's value is set, including when set to `undefined`).
	 *
	 * - Array nodes define a change as when an element is added, removed, moved or replaced.
	 *
	 * - Map nodes define a change as when an entry is added, updated, or removed.
	 *
	 * @remarks
	 * This event is not emitted when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will emit this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is emitted on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When the event is emitted, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 *
	 * TODO: define and document event ordering (ex: bottom up, with nodeChanged before treeChange on each level).
	 *
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (
		data: NodeChangedData<TNode> &
			// For object and Map nodes, make properties specific to them required instead of optional:
			(TNode extends WithType<string, NodeKind.Map | NodeKind.Object>
				? Required<Pick<NodeChangedData<TNode>, "changedProperties">>
				: unknown),
	) => void;
}

/**
 * Extensions to {@link Tree} which are not yet stable.
 * @sealed @beta
 */
export const TreeBeta: {
	/**
	 * Register an event listener on the given node.
	 * @param node - The node whose events should be subscribed to.
	 * @param eventName - Which event to subscribe to.
	 * @param listener - The callback to trigger for the event. The tree can be read during the callback, but it is invalid to modify the tree during this callback.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on<K extends keyof TreeChangeEventsBeta<TNode>, TNode extends TreeNode>(
		node: TNode,
		eventName: K,
		listener: NoInfer<TreeChangeEventsBeta<TNode>[K]>,
	): () => void;

	/**
	 * Clones the persisted data associated with a node.
	 *
	 * @param node - The node to clone.
	 * @returns A new unhydrated node with the same persisted data as the original node.
	 * @remarks
	 * Some key things to note:
	 *
	 * - Local state, such as properties added to customized schema classes, will not be cloned. However, they will be
	 * initialized to their default state just as if the node had been created via its constructor.
	 * - Value node types (i.e., numbers, strings, booleans, nulls and Fluid handles) will be returned as is.
	 * - The identifiers in the node's subtree will be preserved, i.e., they are not replaced with new values.
	 */
	clone<TSchema extends ImplicitFieldSchema>(
		node: TreeFieldFromImplicitField<TSchema>,
	): TreeFieldFromImplicitField<TSchema>;

	// TODO: support more clone options
	// /**
	//  * Like {@link TreeBeta.create}, except deeply clones existing nodes.
	//  * @remarks
	//  * This only clones the persisted data associated with a node.
	//  * Local state, such as properties added to customized schema classes, will not be cloned:
	//  * they will be initialized however they end up after running the constructor, just like if a remote client had inserted the same nodes.
	//  */
	// clone<TSchema extends ImplicitFieldSchema>(
	// 	original: TreeFieldFromImplicitField<TSchema>,
	// 	options?: {
	// 		/**
	// 		 * If set, all identifier's in the cloned tree (See {@link SchemaFactory.identifier}) will be replaced with new ones allocated using the default identifier allocation schema.
	// 		 * Otherwise any identifiers will be preserved as is.
	// 		 */
	// 		replaceIdentifiers?: true;
	// 	},
	// ): TreeFieldFromImplicitField<TSchema>;

	/**
	 * Construct tree content that is compatible with the field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content.
	 * @remarks
	 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
	 * This function exists as a generalization that can be used in other cases as well,
	 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
	 *
	 * Like with {@link TreeNodeSchemaClass}'s constructor, its an error to provide an existing node to this API.
	 * For that case, use {@link TreeBeta.clone}.
	 * @privateRemarks
	 * There should be a way to provide an source for defaulted identifiers, wither via this API or some way to add them to its output later.
	 */
	create<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
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
	 * Less type safe version of {@link TreeBeta.create}, suitable for importing data.
	 * @remarks
	 * Due to {@link ConciseTree} relying on type inference from the data, its use is somewhat limited.
	 * This does not support {@link ConciseTree}'s with customized handle encodings or using persisted keys.
	 * Use "compressed" or "verbose" formats to for more flexibility.
	 *
	 * When using this function,
	 * it is recommend to ensure you schema is unambiguous with {@link ITreeConfigurationOptions.preventAmbiguity}.
	 * If the schema is ambiguous, consider using {@link TreeBeta.create} and {@link Unhydrated} nodes where needed,
	 * or using {@link TreeBeta.(importVerbose:1)} and specify all types.
	 *
	 * Documented (and thus recoverable) error handling/reporting for this is not yet implemented,
	 * but for now most invalid inputs will throw a recoverable error.
	 */
	importConcise<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: InsertableTreeFieldFromImplicitField | ConciseTree,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	>;

	/**
	 * Construct tree content compatible with a field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content. See `Tree.cloneToJSONVerbose`.
	 */
	importVerbose<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: Partial<ParseOptions<IFluidHandle>>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Construct tree content compatible with a field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content. See `Tree.cloneToJSONVerbose`.
	 * @privateRemarks
	 * This could be exposed as a public `Tree.createFromVerbose` function.
	 */
	importVerbose<TSchema extends ImplicitFieldSchema, THandle>(
		schema: TSchema,
		data: VerboseTree<THandle> | undefined,
		options: ParseOptions<THandle>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Same as generic overload, except leaves handles as is.
	 */
	exportConcise(
		node: TreeNode | TreeLeafValue,
		options?: Partial<EncodeOptions<IFluidHandle>>,
	): ConciseTree;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}.
	 */
	exportConcise<THandle>(
		node: TreeNode | TreeLeafValue,
		options?: EncodeOptions<THandle>,
	): ConciseTree<THandle>;

	/**
	 * Same {@link TreeBeta.(exportVerbose:1)} except leaves handles as is.
	 */
	exportVerbose(
		node: TreeNode | TreeLeafValue,
		options?: Partial<EncodeOptions<IFluidHandle>>,
	): VerboseTree;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
	 * Verbose tree format, with explicit type on every node.
	 *
	 * @remarks
	 * There are several cases this may be preferred to {@link TreeBeta.(exportConcise:1)}:
	 *
	 * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), `exportConcise` can produce ambiguous data (the type may be unclear on some nodes).
	 * `exportVerbose` will always be unambiguous and thus lossless.
	 *
	 * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
	 *
	 * 3. When easy access to the type is desired.
	 */
	exportVerbose<T>(node: TreeNode | TreeLeafValue, options: EncodeOptions<T>): VerboseTree<T>;

	/**
	 * Export the content of the provided `tree` in a compressed JSON compatible format.
	 * @remarks
	 * If an `idCompressor` is provided, it will be used to compress identifiers and thus will be needed to decompress the data.
	 *
	 * Always uses "stored" keys.
	 * See {@link EncodeOptions.useStoredKeys} for details.
	 */
	exportCompressed(
		tree: TreeNode | TreeLeafValue,
		options: { oldestCompatibleClient: FluidClientVersion; idCompressor?: IIdCompressor },
	): JsonCompatible<IFluidHandle>;
} = {
	on<K extends keyof TreeChangeEventsBeta<TNode>, TNode extends TreeNode>(
		node: TNode,
		eventName: K,
		listener: NoInfer<TreeChangeEventsBeta<TNode>[K]>,
	): () => void {
		return treeNodeApi.on(node, eventName, listener);
	},

	clone<TSchema extends ImplicitFieldSchema>(
		node: TreeFieldFromImplicitField<TSchema>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		/* The only non-TreeNode cases are {@link Value} (for an empty optional field) which can be returned as is. */
		if (!isTreeNode(node)) {
			return node;
		}

		const kernel = getKernel(node);
		/*
		 * For unhydrated nodes, we can create a cursor by calling `cursorFromInsertable` because the node
		 * hasn't been inserted yet. We can then create a new node from the cursor.
		 */
		if (!kernel.isHydrated()) {
			return createFromCursor(
				kernel.schema,
				cursorFromInsertable<UnsafeUnknownSchema>(kernel.schema, node),
			) as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
		}

		// For hydrated nodes, create a new cursor in the forest and then create a new node from the cursor.
		const forest = kernel.context.flexContext.checkout.forest;
		const cursor = forest.allocateCursor("tree.clone");
		forest.moveCursorToPath(kernel.anchorNode, cursor);
		const clonedNode = createFromCursor(
			kernel.schema,
			cursor as ITreeCursorSynchronous,
		) as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
		cursor.free();
		return clonedNode;
	},

	create: createFromInsertable,

	importConcise<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		schema: UnsafeUnknownSchema extends TSchema
			? ImplicitFieldSchema
			: TSchema & ImplicitFieldSchema,
		data: InsertableTreeFieldFromImplicitField | ConciseTree,
	): Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	> {
		return createFromInsertable<UnsafeUnknownSchema>(
			schema,
			data as InsertableField<UnsafeUnknownSchema>,
		) as Unhydrated<
			TSchema extends ImplicitFieldSchema
				? TreeFieldFromImplicitField<TSchema>
				: TreeNode | TreeLeafValue | undefined
		>;
	},

	importVerbose<TSchema extends ImplicitFieldSchema, THandle>(
		schema: TSchema,
		data: VerboseTree<THandle> | undefined,
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
	},

	exportConcise<T>(
		node: TreeNode | TreeLeafValue,
		options?: Partial<EncodeOptions<T>>,
	): ConciseTree<T> {
		const config: EncodeOptions<T> = {
			valueConverter(handle: IFluidHandle): T {
				return handle as T;
			},
			...options,
		};

		const cursor = borrowCursorFromTreeNodeOrValue(node);
		return conciseFromCursor(cursor, tryGetSchema(node) ?? fail("invalid input"), config);
	},

	exportVerbose<T>(
		node: TreeNode | TreeLeafValue,
		options?: Partial<EncodeOptions<T>>,
	): VerboseTree<T> {
		const config: EncodeOptions<T> = {
			valueConverter(handle: IFluidHandle): T {
				return handle as T;
			},
			...options,
		};

		const cursor = borrowCursorFromTreeNodeOrValue(node);
		return verboseFromCursor(cursor, tryGetSchema(node) ?? fail("invalid input"), config);
	},

	/**
	 * Construct tree content compatible with a field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content. See `Tree.cloneToVerbose`.
	 */
	exportCompressed(
		node: TreeNode | TreeLeafValue,
		options: { oldestCompatibleClient: FluidClientVersion; idCompressor?: IIdCompressor },
	): JsonCompatible<IFluidHandle> {
		const schema = tryGetSchema(node) ?? fail("invalid input");
		const format = versionToFormat[options.oldestCompatibleClient];
		const codec = makeFieldBatchCodec({ jsonValidator: noopValidator }, format);
		const cursor = borrowFieldCursorFromTreeNodeOrValue(node);
		const batch: FieldBatch = [cursor];
		// If none provided, create a compressor which will not compress anything (TODO: is this the right way to do that?).
		const idCompressor = options.idCompressor ?? createIdCompressor();
		const context: FieldBatchEncodingContext = {
			encodeType: TreeCompressionStrategy.Compressed,
			idCompressor,
			originatorId: idCompressor.localSessionId, // Is this right? If so, why is is needed?
			schema: { schema: toStoredSchema(schema), policy: defaultSchemaPolicy },
		};
		const result = codec.encode(batch, context);
		return result;
	},
};

function borrowCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	if (isTreeValue(node)) {
		return cursorFromInsertable(tryGetSchema(node) ?? fail("missing schema"), node);
	}
	const kernel = getKernel(node);
	const cursor = kernel.getOrCreateInnerNode().borrowCursor();
	return cursor;
}

function borrowFieldCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	const cursor = borrowCursorFromTreeNodeOrValue(node);
	// TODO: avoid copy
	const mapTree = mapTreeFromCursor(cursor);
	return cursorForMapTreeField([mapTree]);
}

const versionToFormat = {
	v2_0: 1,
	v2_1: 1,
	v2_2: 1,
	v2_3: 1,
};
