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
	TreeStoredSchemaRepository,
	initializeForest,
	type ITreeCursorSynchronous,
	mapCursorField,
} from "../core/index.js";
import {
	createNodeKeyManager,
	makeFieldBatchCodec,
	makeSchemaCodec,
	type FieldBatchEncodingContext,
	defaultSchemaPolicy,
	chunkTree,
	defaultChunkPolicy,
	TreeCompressionStrategy,
} from "../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../feature-libraries/schema-index/format.js";
import type {
	TreeViewConfiguration,
	ImplicitFieldSchema,
	TreeViewAlpha,
} from "../simple-tree/index.js";
import type { JsonCompatibleReadOnly, JsonCompatible } from "../util/index.js";
import {
	buildConfiguredForest,
	defaultSharedTreeOptions,
	type ForestOptions,
} from "./sharedTree.js";
import { createTreeCheckout } from "./treeCheckout.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

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
	const idCompressor: IIdCompressor = options.idCompressor ?? createIdCompressor();
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();
	const revisionTagCodec = new RevisionTagCodec(idCompressor);
	const schema = new TreeStoredSchemaRepository();
	const forest = buildConfiguredForest(
		options.forest ?? defaultSharedTreeOptions.forest,
		schema,
		idCompressor,
	);
	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema,
	});
	const out: TreeViewAlpha<TSchema> = new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeKeyManager(idCompressor),
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
 * @alpha
 */
export function independentInitializedView<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & ICodecOptions,
	content: ViewContent,
): TreeViewAlpha<TSchema> {
	const idCompressor: IIdCompressor = content.idCompressor;
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();
	const revisionTagCodec = new RevisionTagCodec(idCompressor);

	const fieldBatchCodec = makeFieldBatchCodec(options, 1);
	const schemaCodec = makeSchemaCodec(options);

	const schema = new TreeStoredSchemaRepository(schemaCodec.decode(content.schema as Format));
	const forest = buildConfiguredForest(
		options.forest ?? defaultSharedTreeOptions.forest,
		schema,
		idCompressor,
	);

	const context: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.Compressed,
		idCompressor,
		originatorId: idCompressor.localSessionId, // Is this right? If so, why is is needed?
		schema: { schema, policy: defaultSchemaPolicy },
	};

	const fieldCursors = fieldBatchCodec.decode(content.tree as JsonCompatibleReadOnly, context);
	assert(fieldCursors.length === 1, 0xa5b /* must have exactly 1 field in batch */);
	// Checked above.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const cursors = fieldCursorToNodesCursors(fieldCursors[0]!);

	initializeForest(forest, cursors, revisionTagCodec, idCompressor, false);

	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema,
	});
	const out: TreeViewAlpha<TSchema> = new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeKeyManager(idCompressor),
	);
	return out;
}

function fieldCursorToNodesCursors(
	fieldCursor: ITreeCursorSynchronous,
): ITreeCursorSynchronous[] {
	return mapCursorField(fieldCursor, copyNodeCursor);
}

/**
 * TODO: avoid needing this, or optimize it.
 */
function copyNodeCursor(cursor: ITreeCursorSynchronous): ITreeCursorSynchronous {
	const copy = chunkTree(cursor, {
		policy: defaultChunkPolicy,
		idCompressor: undefined,
	}).cursor();
	copy.enterNode(0);
	return copy;
}

/**
 * The portion of SharedTree data typically persisted by the container.
 * Usable with {@link independentInitializedView} to create a {@link TreeView}
 * without loading a container.
 * @alpha
 */
export interface ViewContent {
	/**
	 * Compressed tree from {@link TreeAlpha.exportCompressed}.
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
