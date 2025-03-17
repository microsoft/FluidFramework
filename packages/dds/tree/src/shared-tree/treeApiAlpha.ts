/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
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
	createFromInsertable,
	cursorFromInsertable,
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
	type ParseOptions,
	type VerboseTree,
	toStoredSchema,
	type EncodeOptions,
	extractPersistedSchema,
	TreeViewConfiguration,
	type TreeBranch,
} from "../simple-tree/index.js";
import { fail, type JsonCompatible } from "../util/index.js";
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
} from "../feature-libraries/index.js";
import { independentInitializedView, type ViewContent } from "./independentView.js";
import { SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";

/**
 * Extensions to {@link Tree} and {@link TreeBeta} which are not yet stable.
 * @sealed @alpha
 */
export const TreeAlpha: {
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
	 *
	 * Like with {@link TreeNodeSchemaClass}'s constructor, it's an error to provide an existing node to this API.
	 * For that case, use {@link TreeBeta.clone}.
	 * @privateRemarks
	 * There should be a way to provide a source for defaulted identifiers, wither via this API or some way to add them to its output later.
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
	 * Less type safe version of {@link TreeAlpha.create}, suitable for importing data.
	 * @remarks
	 * Due to {@link ConciseTree} relying on type inference from the data, its use is somewhat limited.
	 * This does not support {@link ConciseTree|ConciseTrees} with customized handle encodings or using persisted keys.
	 * Use "compressed" or "verbose" formats for more flexibility.
	 *
	 * When using this function,
	 * it is recommend to ensure your schema is unambiguous with {@link ITreeConfigurationOptions.preventAmbiguity}.
	 * If the schema is ambiguous, consider using {@link TreeAlpha.create} and {@link Unhydrated} nodes where needed,
	 * or using {@link TreeAlpha.(importVerbose:1)} and specify all types.
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
	 * @param data - The data used to construct the field content. See {@link TreeAlpha.(exportVerbose:1)}.
	 */
	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: Partial<ParseOptions>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}.
	 */
	exportConcise(node: TreeNode | TreeLeafValue, options?: EncodeOptions): ConciseTree;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object (except for {@link @fluidframework/core-interfaces#IFluidHandle|IFluidHandles}).
	 * Uses the {@link VerboseTree} format, with an explicit type on every node.
	 *
	 * @remarks
	 * There are several cases this may be preferred to {@link TreeAlpha.exportConcise}:
	 *
	 * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), `exportConcise` can produce ambiguous data (the type may be unclear on some nodes).
	 * `exportVerbose` will always be unambiguous and thus lossless.
	 *
	 * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
	 *
	 * 3. When easy access to the type is desired.
	 */
	exportVerbose(node: TreeNode | TreeLeafValue, options?: EncodeOptions): VerboseTree;

	/**
	 * Export the content of the provided `tree` in a compressed JSON compatible format.
	 * @remarks
	 * If an `idCompressor` is provided, it will be used to compress identifiers and thus will be needed to decompress the data.
	 *
	 * Always uses "stored" keys.
	 * See {@link EncodeOptions.useStoredKeys} for details.
	 * @privateRemarks
	 * TODO: It is currently not clear how to work with the idCompressors correctly in the package API.
	 * Better APIs should probably be provided as there is currently no way to associate an un-hydrated tree with an idCompressor,
	 * Nor get the correct idCompressor from a subtree to use when exporting it.
	 * Additionally using `createIdCompressor` to make an idCompressor is `@legacy` and thus not intended for use in this API surface.
	 * It would probably make more sense if we provided a way to get an idCompressor from the context of a node,
	 * which could be optional (and settable if missing) for un0hydrated nodes and required for hydrated ones.
	 * Add in a stable public APi for creating idCompressors, and a way to get them from a tree (without view schema), and that should address the anticipated use-cases.
	 */
	exportCompressed(
		tree: TreeNode | TreeLeafValue,
		options: { oldestCompatibleClient: FluidClientVersion; idCompressor?: IIdCompressor },
	): JsonCompatible<IFluidHandle>;

	/**
	 * Import data encoded by {@link TreeAlpha.exportCompressed}.
	 *
	 * @param schema - Schema with which the data must be compatible. This compatibility is not verified and must be ensured by the caller.
	 * @param compressedData - Data compressed by {@link TreeAlpha.exportCompressed}.
	 * @param options - If {@link TreeAlpha.exportCompressed} was given an `idCompressor`, it must be provided here.
	 *
	 * @remarks
	 * If the data could have been encoded with a different schema, consider encoding the schema along side it using {@link extractPersistedSchema} and loading the data using {@link independentView}.
	 *
	 * @privateRemarks
	 * This API could be improved:
	 *
	 * 1. It could validate that the schema is compatible, and return or throw an error in the invalid case (maybe add a "try" version).
	 * 2. A "try" version of this could return an error if the data isn't in a supported format (as determined by version and/or JasonValidator).
	 * 3. Requiring the caller provide a JsonValidator isn't the most friendly API. It might be practical to provide a default.
	 */
	importCompressed<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		compressedData: JsonCompatible<IFluidHandle>,
		options: { idCompressor?: IIdCompressor } & ICodecOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;
} = {
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

	create: createFromInsertable,

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
		return createFromInsertable<UnsafeUnknownSchema>(
			schema,
			data as InsertableField<UnsafeUnknownSchema>,
		) as Unhydrated<
			TSchema extends ImplicitFieldSchema
				? TreeFieldFromImplicitField<TSchema>
				: TreeNode | TreeLeafValue | undefined
		>;
	},

	importVerbose<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: VerboseTree | undefined,
		options?: ParseOptions,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		const config: ParseOptions = { ...options };
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

	exportConcise(node: TreeNode | TreeLeafValue, options?: EncodeOptions): ConciseTree {
		const config: EncodeOptions = { ...options };

		const cursor = borrowCursorFromTreeNodeOrValue(node);
		return conciseFromCursor(
			cursor,
			tryGetSchema(node) ?? fail(0xacd /* invalid input */),
			config,
		);
	},

	exportVerbose(node: TreeNode | TreeLeafValue, options?: EncodeOptions): VerboseTree {
		const config: EncodeOptions = { ...options };

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
		const format = versionToFormat[options.oldestCompatibleClient];
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
		const content: ViewContent = {
			schema: extractPersistedSchema(schema),
			tree: compressedData,
			idCompressor: options.idCompressor ?? createIdCompressor(),
		};
		const config = new TreeViewConfiguration({ schema });
		const view = independentInitializedView(config, options, content);
		return TreeBeta.clone<TSchema>(view.root);
	},
};

function borrowCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	if (isTreeValue(node)) {
		return cursorFromInsertable<UnsafeUnknownSchema>(
			tryGetSchema(node) ?? fail(0xad0 /* missing schema */),
			node,
		);
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
