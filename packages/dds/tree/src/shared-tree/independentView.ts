/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type IIdCompressor,
	createIdCompressor,
} from "@fluidframework/id-compressor/internal";

import type { ICodecOptions } from "../codec/index.js";
import {
	type RevisionTag,
	RevisionTagCodec,
	SchemaVersion,
	TreeStoredSchemaRepository,
} from "../core/index.js";
import {
	createNodeIdentifierManager,
	makeFieldBatchCodec,
	makeSchemaCodec,
	type FieldBatchEncodingContext,
	defaultSchemaPolicy,
	TreeCompressionStrategy,
	defaultIncrementalEncodingPolicy,
} from "../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../feature-libraries/schema-index/formatV1.js";
import type {
	TreeViewConfiguration,
	ImplicitFieldSchema,
	TreeViewAlpha,
	ITreeAlpha,
	ViewableTree,
	TreeView,
	ReadSchema,
	VerboseTree,
	SimpleTreeSchema,
} from "../simple-tree/index.js";
import {
	type JsonCompatibleReadOnly,
	type JsonCompatible,
	Breakable,
	oneFromIterable,
} from "../util/index.js";
import {
	buildConfiguredForest,
	defaultSharedTreeOptions,
	exportSimpleSchema,
	type ForestOptions,
} from "./sharedTree.js";
import { createTreeCheckout } from "./treeCheckout.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { initialize, initializerFromChunk } from "./schematizeTree.js";
import { combineChunks } from "../feature-libraries/index.js";

/**
 * Create an uninitialized {@link TreeView} that is not tied to any {@link ITree} instance.
 *
 * @remarks
 * Such a view can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some Fluid service.
 * @alpha
 */
export function independentView<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & { idCompressor?: IIdCompressor | undefined },
): TreeViewAlpha<TSchema> {
	return createIndependentTreeAlpha(options).viewWith(config) as TreeViewAlpha<TSchema>;
}

/**
 * Create an initialized {@link TreeView} that is not tied to any {@link ITree} instance.
 *
 * @remarks
 * Such a view can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some Fluid service.
 * @privateRemarks
 * TODO: Providing an API which generates a {@link ViewableTree} extended with export options from {@link ITreeAlpha} and maybe even branching APIs would likely be better that just exposing a {@link TreeViewAlpha}.
 * @alpha
 */
export function independentInitializedView<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & ICodecOptions,
	content: ViewContent,
): TreeViewAlpha<TSchema> {
	return createIndependentTreeAlpha({ ...options, content }).viewWith(
		config,
	) as TreeViewAlpha<TSchema>;
}

/**
 * Create a {@link ViewableTree} that is not tied to any Fluid runtimes or services.
 *
 * @remarks
 * Such a tree can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some Fluid service.
 *
 * @example
 * ```typescript
 * const tree = createIndependentTreeBeta();
 *
 * const stagedConfig = new TreeViewConfiguration({
 * 	schema: SchemaFactoryAlpha.types([
 * 		SchemaFactory.number,
 * 		SchemaFactoryAlpha.staged(SchemaFactory.string),
 * 	]),
 * });
 * const afterConfig = new TreeViewConfigurationAlpha({
 * 	schema: [SchemaFactory.number, SchemaFactory.string],
 * });
 *
 * // Initialize tree
 * {
 * 	const view = tree.viewWith(stagedConfig);
 * 	view.initialize(1);
 * 	view.dispose();
 * }
 *
 * // Do schema upgrade
 * {
 * 	const view = tree.viewWith(afterConfig);
 * 	view.upgradeSchema();
 * 	view.root = "A";
 * 	view.dispose();
 * }
 *
 * // Can still view tree with staged schema
 * {
 * 	const view = tree.viewWith(stagedConfig);
 * 	assert.equal(view.root, "A");
 * 	view.dispose();
 * }
 * ```
 * @privateRemarks
 * Before stabilizing this as public, consider if we can instead just expose a better way to create regular Fluid service based SharedTrees for tests.
 * Something like https://github.com/microsoft/FluidFramework/pull/25422 might be a better long term stable/public solution.
 * @beta
 */
export function createIndependentTreeBeta<const TSchema extends ImplicitFieldSchema>(
	options?: ForestOptions,
): ViewableTree {
	return createIndependentTreeAlpha<TSchema>(options);
}

/**
 * Alpha extensions to {@link createIndependentTreeBeta}.
 *
 * @param options - Configuration options for the independent tree.
 * This can be used to create an uninitialized tree, or `content` can be provided to create an initialized tree.
 * If content is provided, the idCompressor is a required part of it: otherwise it is optional and provided at the top level.
 *
 * @privateRemarks
 * TODO: Support more of {@link ITreeAlpha}, including branching APIs to allow for merges.
 * TODO: Better unify this logic with SharedTreeKernel and SharedTreeCore.
 *
 * Before further stabilizing: consider better ways to handle initialized vs uninitialized trees.
 * Perhaps it would be better to not allow initialize here at all, but expose the ability to load compressed tree content and stored schema via ITree or TreeView?
 * If keeping the option here, maybe a separate function of overload would be better? Or maybe flatten ViewContent inline to deduplicate the idCompressor options?
 * @alpha
 */
export function createIndependentTreeAlpha<const TSchema extends ImplicitFieldSchema>(
	options?: ForestOptions &
		(
			| ({ idCompressor?: IIdCompressor | undefined } & { content?: undefined })
			| (ICodecOptions & { content: ViewContent } & { idCompressor?: undefined })
		),
): ViewableTree & Pick<ITreeAlpha, "exportVerbose" | "exportSimpleSchema"> {
	const breaker = new Breakable("independentView");
	const idCompressor: IIdCompressor =
		options?.idCompressor ?? options?.content?.idCompressor ?? createIdCompressor();
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();
	const revisionTagCodec = new RevisionTagCodec(idCompressor);

	// To ensure the forest is in schema when constructed, start it with an empty schema and set the schema repository content later.
	const schemaRepository = new TreeStoredSchemaRepository();

	const forest = buildConfiguredForest(
		breaker,
		options?.forest ?? defaultSharedTreeOptions.forest,
		schemaRepository,
		idCompressor,
		defaultIncrementalEncodingPolicy,
	);

	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema: schemaRepository,
		breaker,
	});

	if (options?.content !== undefined) {
		const schemaCodec = makeSchemaCodec(options, SchemaVersion.v1);
		const fieldBatchCodec = makeFieldBatchCodec(options, 1);
		const newSchema = schemaCodec.decode(options.content.schema as Format);

		const context: FieldBatchEncodingContext = {
			encodeType: TreeCompressionStrategy.Compressed,
			idCompressor,
			originatorId: idCompressor.localSessionId, // Is this right? If so, why is is needed?
			schema: { schema: newSchema, policy: defaultSchemaPolicy },
		};
		const fieldCursors = fieldBatchCodec.decode(
			options.content.tree as JsonCompatibleReadOnly,
			context,
		);
		assert(fieldCursors.length === 1, 0xa5b /* must have exactly 1 field in batch */);

		const fieldCursor = oneFromIterable(fieldCursors);
		assert(fieldCursor !== undefined, 0xc94 /* expected exactly one field in batch */);

		initialize(
			checkout,
			newSchema,
			initializerFromChunk(checkout, () =>
				combineChunks(checkout.forest.chunkField(fieldCursor)),
			),
		);
	}

	return {
		viewWith<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		): TreeView<TRoot> {
			const out: TreeViewAlpha<TSchema> = new SchematizingSimpleTreeView<TSchema>(
				checkout,
				config as TreeViewConfiguration as TreeViewConfiguration<ReadSchema<TSchema>>,
				createNodeIdentifierManager(idCompressor),
			);
			return out as unknown as TreeView<TRoot>;
		},

		exportVerbose(): VerboseTree | undefined {
			return checkout.exportVerbose();
		},

		exportSimpleSchema(): SimpleTreeSchema {
			return exportSimpleSchema(checkout.storedSchema);
		},
	};
}

/**
 * The portion of SharedTree data typically persisted by the container.
 * Usable with {@link independentInitializedView} to create a {@link TreeView}
 * without loading a container.
 * @alpha
 */
export interface ViewContent {
	/**
	 * Compressed tree from {@link (TreeAlpha:interface).exportCompressed}.
	 * @remarks
	 * This is an owning reference:
	 * consumers of this content might modify this data in place (for example when applying edits) to avoid copying.
	 */
	readonly tree: JsonCompatible<IFluidHandle>;
	/**
	 * Persisted schema from {@link extractPersistedSchema}.
	 */
	readonly schema: JsonCompatible;
	/**
	 * IIdCompressor which will be used to decompress any compressed identifiers in `tree`
	 * as well as for any other identifiers added to the view.
	 */
	readonly idCompressor: IIdCompressor;
}
