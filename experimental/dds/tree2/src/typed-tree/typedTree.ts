/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import {
	FieldSchema,
	TypedField,
	createNodeKeyManager,
	nodeKeyFieldKey,
} from "../feature-libraries";
import {
	SharedTree,
	SharedTreeOptions,
	InitializeAndSchematizeConfiguration,
} from "../shared-tree";
import { brand } from "../util";

/**
 * Configuration to specialize a Tree DDS for a particular use.
 * @alpha
 */
export interface TypedTreeOptions extends SharedTreeOptions {
	/**
	 * Name appended to {@link @fluidframework/datastore-definitions#IChannelFactory."type"} to identify this factory configuration.
	 * @privateRemarks
	 * TODO: evaluate if this design is a good idea, or if "subtype" should be removed.
	 * TODO: evaluate if schematize should be separated from DDS construction.
	 */
	readonly subtype: string;
}

/**
 * Channel for a Tree DDS.
 * @alpha
 */
export interface TypedTreeChannel extends IChannel {
	/**
	 * Returns a tree known to be compatible with the provided schema with a schema aware API based on that schema.
	 *
	 * @remarks
	 * If the tree is uninitialized (has no schema and no content), the tree is initialized with the provided `initialTree` and `schema`.
	 *
	 * The tree (now known to have been initialized) has its stored schema checked against the provided view `schema`.
	 *
	 * If the schema are compatible (including updating the stored schema if permitted via `allowedSchemaModifications`),
	 * a {@link TreeField} for the root of the tree is returned, with a schema aware API based on the provided view schema.
	 *
	 * If the schema are not compatible, and exception is thrown.
	 *
	 * @privateRemarks
	 * TODO: make the mismatch case recoverable.
	 * - Provide a way to make a generic view schema for any document.
	 * - Produce/throw the error in a document recoverable way (ex: specific exception type or return value).
	 * TODO: Document and handle what happens when the stored schema changes after schematize has returned. Is some invalidation contract needed? How does editable tree behave?
	 * TODO: Clarify lifetimes. Ensure calling schematize multiple times does not leak.
	 * TODO: Support adapters for handling out of schema data.
	 *
	 * Doing initialization here, regardless of `AllowedUpdateType`, allows a small API that is hard to use incorrectly.
	 * Other approach tend to have leave easy to make mistakes.
	 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing document,
	 * or call it unconditionally leaving an app that can only create new documents.
	 * It also would require the schema to be passed into to separate places and could cause issues if they didn't match.
	 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
	 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
	 * on the create code-path (for example how a schematized factory might do it),
	 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
	 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
	 * this initialization could become just another out of schema content adapter: at tha point it clearly belong here in schematize.
	 */
	schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TypedField<TRoot>;
}

/**
 * A channel factory that creates a {@link TreeField}.
 * @alpha
 */
export class TypedTreeFactory implements IChannelFactory {
	public readonly type: string;
	public readonly attributes: IChannelAttributes;

	public constructor(private readonly options: TypedTreeOptions) {
		this.type = `https://graph.microsoft.com/types/tree/${options.subtype}`;

		this.attributes = {
			type: this.type,
			snapshotFormatVersion: "0.0.0",
			packageVersion: "0.0.0",
		};
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<TypedTreeChannel> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return new ChannelWrapperWithSchematize(runtime, tree);
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): TypedTreeChannel {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		return new ChannelWrapperWithSchematize(runtime, tree);
	}
}

/**
 * IChannel wrapper.
 * Subclass to add specific functionality.
 *
 * @remarks
 * This is handy when an implementing IChannelFactory and it's desirable to return a type that's derived from another IChannel implementation.
 */
class ChannelWrapper implements IChannel {
	public constructor(private readonly inner: IChannel) {}

	public get id(): string {
		return this.inner.id;
	}

	public get attributes(): IChannelAttributes {
		return this.inner.attributes;
	}

	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.inner.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.inner.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}

	public isAttached(): boolean {
		return this.inner.isAttached();
	}

	public connect(services: IChannelServices): void {
		return this.inner.connect(services);
	}
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.inner.getGCData(fullGC);
	}

	public get handle(): IFluidHandle {
		return this.inner.handle;
	}

	public get IFluidLoadable(): IFluidLoadable {
		return this.inner.IFluidLoadable;
	}
}

/**
 * IChannel wrapper that exposes "schematize".
 */
class ChannelWrapperWithSchematize extends ChannelWrapper implements TypedTreeChannel {
	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly tree: SharedTree,
	) {
		super(tree);
	}

	public schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TypedField<TRoot> {
		const nodeKeyManager = createNodeKeyManager(this.runtime.idCompressor);
		const view = this.tree.schematize(config);
		return view.editableTree2(config.schema, nodeKeyManager, brand(nodeKeyFieldKey));
	}
}
