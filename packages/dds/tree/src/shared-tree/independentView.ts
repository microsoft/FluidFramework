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
	type ITreeCursorSynchronous,
	type RevisionTag,
	RevisionTagCodec,
	SchemaVersion,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
} from "../core/index.js";
import {
	createNodeIdentifierManager,
	makeFieldBatchCodec,
	makeSchemaCodec,
	type FieldBatchEncodingContext,
	defaultSchemaPolicy,
	TreeCompressionStrategy,
} from "../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../feature-libraries/schema-index/formatV1.js";
import type {
	TreeViewConfiguration,
	ImplicitFieldSchema,
	TreeViewAlpha,
} from "../simple-tree/index.js";
import { type JsonCompatibleReadOnly, type JsonCompatible, Breakable } from "../util/index.js";
import {
	buildConfiguredForest,
	defaultSharedTreeOptions,
	type ForestOptions,
} from "./sharedTree.js";
import { createTreeCheckout } from "./treeCheckout.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { initialize } from "./schematizeTree.js";

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
	const breaker = new Breakable("independentView");
	const idCompressor: IIdCompressor = options.idCompressor ?? createIdCompressor();
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();
	const revisionTagCodec = new RevisionTagCodec(idCompressor);
	const schema = new TreeStoredSchemaRepository();
	const forest = buildConfiguredForest(
		breaker,
		options.forest ?? defaultSharedTreeOptions.forest,
		schema,
		idCompressor,
	);
	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema,
		breaker,
	});
	const out: TreeViewAlpha<TSchema> = new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeIdentifierManager(idCompressor),
	);
	return out;
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
	const idCompressor: IIdCompressor = content.idCompressor;
	const fieldBatchCodec = makeFieldBatchCodec(options, 1);
	const schemaCodec = makeSchemaCodec(options, SchemaVersion.v1);

	const schema = schemaCodec.decode(content.schema as Format);
	const context: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.Compressed,
		idCompressor,
		originatorId: idCompressor.localSessionId, // Is this right? If so, why is is needed?
		schema: { schema, policy: defaultSchemaPolicy },
	};

	const fieldCursors = fieldBatchCodec.decode(content.tree as JsonCompatibleReadOnly, context);
	assert(fieldCursors.length === 1, 0xa5b /* must have exactly 1 field in batch */);

	const out: TreeViewAlpha<TSchema> = independentInitializedViewInternal<TSchema>(
		config,
		options,
		schema,
		// Checked above.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		fieldCursors[0]!,
		idCompressor,
	);
	return out;
}

/**
 * {@link independentInitializedView} but using internal types instead of persisted data formats.
 */
export function independentInitializedViewInternal<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & ICodecOptions,
	schema: TreeStoredSchema,
	rootFieldCursor: ITreeCursorSynchronous,
	idCompressor: IIdCompressor,
): SchematizingSimpleTreeView<TSchema> {
	const breaker = new Breakable("independentInitializedView");
	const revisionTagCodec = new RevisionTagCodec(idCompressor);
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();

	// To ensure the forest is in schema when constructed, start it with an empty schema and set the schema repository content later.
	const schemaRepository = new TreeStoredSchemaRepository();

	const forest = buildConfiguredForest(
		breaker,
		options.forest ?? defaultSharedTreeOptions.forest,
		schemaRepository,
		idCompressor,
	);

	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema: schemaRepository,
		breaker,
	});

	initialize(checkout, { schema, initialTree: rootFieldCursor });
	return new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeIdentifierManager(idCompressor),
	);
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
