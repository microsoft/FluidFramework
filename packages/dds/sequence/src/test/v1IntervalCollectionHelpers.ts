/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { Client } from "@fluidframework/merge-tree/internal";

import {
	ISerializedIntervalCollectionV2,
	IntervalCollection,
	LocalIntervalCollection,
	makeOpsMap,
} from "../intervalCollection.js";
import { IntervalCollectionMap } from "../intervalCollectionMap.js";
import {
	IIntervalCollectionFactory,
	IIntervalCollectionOperation,
	IIntervalCollectionType,
	IValueOpEmitter,
} from "../intervalCollectionMapInterfaces.js";
import {
	IIntervalHelpers,
	ISerializedInterval,
	IntervalOpType,
	SequenceInterval,
	createSequenceInterval,
} from "../intervals/index.js";
import { pkgVersion } from "../packageVersion.js";
import { SharedStringClass } from "../sharedString.js";

export interface IntervalCollectionInternals {
	client: Client;
	savedSerializedIntervals?: ISerializedInterval[];
	localCollection: LocalIntervalCollection;
	getNextLocalSeq(): number;
}

export class V1IntervalCollection extends IntervalCollection {
	casted = this as unknown as IntervalCollectionInternals;
}

class V1SequenceIntervalCollectionFactory
	implements IIntervalCollectionFactory<SequenceInterval>
{
	public load(
		emitter: IValueOpEmitter,
		raw: ISerializedInterval[] | ISerializedIntervalCollectionV2 = [],
	): V1IntervalCollection {
		const helpers: IIntervalHelpers<SequenceInterval> = {
			create: createSequenceInterval,
		};
		return new V1IntervalCollection(helpers, true, emitter, raw, {});
	}
	public store(
		value: V1IntervalCollection,
	): ISerializedInterval[] | ISerializedIntervalCollectionV2 {
		return Array.from(value, (interval) =>
			interval?.serialize(),
		) as unknown as ISerializedIntervalCollectionV2;
	}
}

export class V1SequenceIntervalCollectionValueType
	implements IIntervalCollectionType<SequenceInterval>
{
	public static Name = "sharedStringIntervalCollection";

	public get name(): string {
		return V1SequenceIntervalCollectionValueType.Name;
	}

	public get factory(): IIntervalCollectionFactory<SequenceInterval> {
		return V1SequenceIntervalCollectionValueType._factory;
	}

	public get ops(): Map<IntervalOpType, IIntervalCollectionOperation<SequenceInterval>> {
		return V1SequenceIntervalCollectionValueType._ops;
	}

	private static readonly _factory: IIntervalCollectionFactory<SequenceInterval> =
		new V1SequenceIntervalCollectionFactory();

	private static readonly _ops = makeOpsMap<SequenceInterval>();
}

interface SharedStringInternals {
	intervalCollections: IntervalCollectionMap<SequenceInterval>;
}

export class SharedStringWithV1IntervalCollection extends SharedStringClass {
	/**
	 * Create a new shared string.
	 * @param runtime - data store runtime the new shared string belongs to
	 * @param id - optional name of the shared string
	 * @returns newly create shared string (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(
			id,
			V1IntervalCollectionSharedStringFactory.Type,
		) as SharedStringWithV1IntervalCollection;
	}

	/**
	 * Get a factory for SharedString to register with the data store.
	 * @returns a factory that creates and load SharedString
	 */
	public static getFactory() {
		return new V1IntervalCollectionSharedStringFactory();
	}

	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(document, id, attributes);
		(this as unknown as SharedStringInternals).intervalCollections = new IntervalCollectionMap(
			this.serializer,
			this.handle,
			(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
			new V1SequenceIntervalCollectionValueType(),
			{},
		);
	}
}

export class V1IntervalCollectionSharedStringFactory implements IChannelFactory {
	// TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
	// load code (UPDATE: paparazzi is gone... anything to do here?)
	public static Type = "https://graph.microsoft.com/types/mergeTree";

	public static readonly Attributes: IChannelAttributes = {
		type: V1IntervalCollectionSharedStringFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return V1IntervalCollectionSharedStringFactory.Type;
	}

	public get attributes() {
		return V1IntervalCollectionSharedStringFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedStringWithV1IntervalCollection> {
		const sharedString = new SharedStringWithV1IntervalCollection(runtime, id, attributes);
		await sharedString.load(services);
		return sharedString;
	}

	public create(
		document: IFluidDataStoreRuntime,
		id: string,
	): SharedStringWithV1IntervalCollection {
		const sharedString = new SharedStringWithV1IntervalCollection(
			document,
			id,
			this.attributes,
		);
		sharedString.initializeLocal();
		return sharedString;
	}
}
