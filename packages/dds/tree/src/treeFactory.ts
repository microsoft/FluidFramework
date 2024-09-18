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
import { createAlwaysFinalizedIdCompressor } from "@fluidframework/id-compressor/internal";

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
	RevisionTagCodec,
	TreeStoredSchemaRepository,
	type RevisionTag,
} from "./core/index.js";
import { createNodeKeyManager } from "./feature-libraries/index.js";

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
 * Create a {@link TreeView} that is not tied to any {@link SharedTree} instance.
 *
 * @remarks
 * Such a view can never experience collaboration or be persisted to to a Fluid Container.
 *
 * This can be useful for testing, as well as use-cases like working on local files instead of documents stored in some fluid service.
 * @alpha
 */
export function independentView<TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: SharedTreeOptions & { idCompressor?: IIdCompressor | undefined },
): TreeView<TSchema> {
	const idCompressor: IIdCompressor =
		options.idCompressor ?? createAlwaysFinalizedIdCompressor();
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
	return new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeKeyManager(idCompressor),
	);
}
