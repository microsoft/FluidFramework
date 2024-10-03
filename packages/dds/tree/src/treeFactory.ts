/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ISharedObjectKind,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
import {
	buildConfiguredForest,
	createTreeCheckout,
	SharedTree as SharedTreeImpl,
	type ForestOptions,
	type SharedTreeOptions,
} from "./shared-tree/index.js";
import type {
	ImplicitFieldSchema,
	ITree,
	TreeView,
	TreeViewConfiguration,
} from "./simple-tree/index.js";
import { SchematizingSimpleTreeView, defaultSharedTreeOptions } from "./shared-tree/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	initializeForest,
	mapCursorField,
	RevisionTagCodec,
	TreeStoredSchemaRepository,
	type ITreeCursorSynchronous,
	type RevisionTag,
} from "./core/index.js";
import {
	chunkTree,
	createNodeKeyManager,
	defaultChunkPolicy,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
	makeSchemaCodec,
	TreeCompressionStrategy,
	type FieldBatchEncodingContext,
} from "./feature-libraries/index.js";
import type { JsonCompatible, JsonCompatibleReadOnly } from "./util/index.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ICodecOptions } from "./codec/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "./feature-libraries/schema-index/index.js";

/**
 * A channel factory that creates an {@link ITree}.
 */
export class TreeFactory implements IChannelFactory<ITree> {
	public static readonly Type = "https://graph.microsoft.com/types/tree";
	public static readonly attributes: IChannelAttributes = {
		type: this.Type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: pkgVersion,
	};

	public readonly type = TreeFactory.Type;
	public readonly attributes: IChannelAttributes = TreeFactory.attributes;

	public constructor(private readonly options: SharedTreeOptions) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<SharedTreeImpl> {
		const tree = new SharedTreeImpl(id, runtime, channelAttributes, this.options);
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTreeImpl {
		const tree = new SharedTreeImpl(id, runtime, this.attributes, this.options);
		tree.initializeLocal();
		return tree;
	}
}

/**
 * SharedTree is a hierarchical data structure for collaboratively editing strongly typed JSON-like trees
 * of objects, arrays, and other data types.
 * @legacy
 * @alpha
 */
export const SharedTree = configuredSharedTree({});

/**
 * {@link SharedTree} but allowing a non-default configuration.
 * @remarks
 * This is useful for debugging and testing to opt into extra validation or see if opting out of some optimizations fixes an issue.
 * @example
 * ```typescript
 * import {
 * 	ForestType,
 * 	TreeCompressionStrategy,
 * 	configuredSharedTree,
 * 	typeboxValidator,
 * 	// eslint-disable-next-line import/no-internal-modules
 * } from "@fluidframework/tree/internal";
 * const SharedTree = configuredSharedTree({
 * 	forest: ForestType.Reference,
 * 	jsonValidator: typeboxValidator,
 * 	treeEncodeType: TreeCompressionStrategy.Uncompressed,
 * });
 * ```
 * @privateRemarks
 * This should be legacy, but has to be internal due to limitations of API tagging preventing it from being both alpha and alpha+legacy.
 * TODO:
 * Expose Ajv validator for better error message quality somehow.
 * Maybe as part of a test utils or dev-tool package?
 * @internal
 */
export function configuredSharedTree(
	options: SharedTreeOptions,
): ISharedObjectKind<ITree> & SharedObjectKind<ITree> {
	class ConfiguredFactory extends TreeFactory {
		public constructor() {
			super(options);
		}
	}
	return createSharedObjectKind<ITree>(ConfiguredFactory);
}

/**
 * Create an uninitialized {@link TreeView} that is not tied to any {@link ITree} instance.
 *
 * @remarks
 * Such a view can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some Fluid service.
 * @alpha
 */
export function independentView<TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & { idCompressor?: IIdCompressor | undefined },
): TreeView<TSchema> {
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
	const out: TreeView<TSchema> = new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeKeyManager(idCompressor),
	);
	return out;
}

/**
 * Create an uninitialized {@link TreeView} that is not tied to any {@link ITree} instance.
 *
 * @remarks
 * Such a view can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some Fluid service.
 * @alpha
 */
export function independentInitializedView<TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & ICodecOptions,
	content: ViewContent,
): TreeView<TSchema> {
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
	assert(fieldCursors.length === 1, "must have exactly 1 field in batch");
	// Checked above.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const cursors = fieldCursorToNodesCursors(fieldCursors[0]!);

	initializeForest(forest, cursors, revisionTagCodec, idCompressor, false);

	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema,
	});
	const out: TreeView<TSchema> = new SchematizingSimpleTreeView<TSchema>(
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
 * @alpha
 */
export interface ViewContent {
	/**
	 * Compressed tree from {@link TreeBeta.exportCompressed}.
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
	 * idCompressor
	 */
	readonly idCompressor: IIdCompressor;
}
