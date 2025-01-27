/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import { IIntervalCollection, IntervalCollectionValueType } from "./intervalCollection.js";
import { IMapOperation, IntervalCollectionMap } from "./intervalCollectionMap.js";
import { IMapMessageLocalMetadata } from "./intervalCollectionMapInterfaces.js";
import { ISerializableInterval, Interval } from "./intervals/index.js";
import { pkgVersion } from "./packageVersion.js";

const snapshotFileName = "header";

/**
 * The factory that defines the SharedIntervalCollection.
 * @deprecated `SharedIntervalCollection` is not maintained and is planned to be removed.
 * @internal
 */
export class SharedIntervalCollectionFactory implements IChannelFactory {
	public static readonly Type = "https://graph.microsoft.com/types/sharedIntervalCollection";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedIntervalCollectionFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return SharedIntervalCollectionFactory.Type;
	}

	public get attributes() {
		return SharedIntervalCollectionFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedIntervalCollection> {
		const map = new SharedIntervalCollection(id, runtime, attributes);
		await map.load(services);

		return map;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedIntervalCollection {
		const map = new SharedIntervalCollection(id, runtime, this.attributes);
		map.initializeLocal();

		return map;
	}
}

/**
 * @legacy
 * @alpha
 */
export interface ISharedIntervalCollection<TInterval extends ISerializableInterval> {
	getIntervalCollection(label: string): IIntervalCollection<TInterval>;
}

/**
 * @deprecated `SharedIntervalCollection` is not maintained and is planned to be removed.
 * @internal
 */
export class SharedIntervalCollection
	extends SharedObject
	implements ISharedIntervalCollection<Interval>
{
	/**
	 * Create a SharedIntervalCollection
	 *
	 * @param runtime - data store runtime the new shared map belongs to
	 * @param id - optional name of the shared map
	 * @returns newly create shared map (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(
			id,
			SharedIntervalCollectionFactory.Type,
		) as SharedIntervalCollection;
	}

	/**
	 * Get a factory for SharedIntervalCollection to register with the data store.
	 *
	 * @returns a factory that creates and load SharedIntervalCollection
	 */
	public static getFactory(): IChannelFactory {
		return new SharedIntervalCollectionFactory();
	}

	public readonly [Symbol.toStringTag]: string = "SharedIntervalCollection";
	private readonly intervalCollections: IntervalCollectionMap<Interval>;

	/**
	 * Constructs a new shared SharedIntervalCollection. If the object is non-local an id and service interfaces will
	 * be provided
	 */
	constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
		super(id, runtime, attributes, "fluid_sharedIntervalCollection_");
		this.intervalCollections = new IntervalCollectionMap(
			this.serializer,
			this.handle,
			(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
			new IntervalCollectionValueType(),
			runtime.options,
		);
	}

	public getIntervalCollection(label: string): IIntervalCollection<Interval> {
		const realLabel = this.getIntervalCollectionPath(label);
		const sharedCollection = this.intervalCollections.get(realLabel);
		return sharedCollection;
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(
			snapshotFileName,
			this.intervalCollections.serialize(serializer),
		);
	}

	protected reSubmitCore(content: any, localOpMetadata: unknown) {
		this.intervalCollections.tryResubmitMessage(
			content,
			localOpMetadata as IMapMessageLocalMetadata,
		);
	}

	protected onDisconnect() {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService) {
		const blob = await storage.readBlob(snapshotFileName);
		const header = bufferToString(blob, "utf8");
		this.intervalCollections.populate(header);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			assert(
				this.intervalCollections.tryProcessMessage(
					message.contents as IMapOperation,
					local,
					message,
					localOpMetadata,
				),
				"SharedIntervalCollection received an unrecognized op, possibly from a newer version",
			);
		}
	}

	/**
	 * Creates the full path of the intervalCollection label
	 * @param label - the incoming label
	 */
	protected getIntervalCollectionPath(label: string): string {
		return label;
	}

	protected applyStashedOp() {
		throw new Error("not implemented");
	}
}
