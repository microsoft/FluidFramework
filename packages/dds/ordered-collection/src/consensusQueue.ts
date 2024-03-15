/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ConsensusOrderedCollection } from "./consensusOrderedCollection.js";
import { ConsensusQueueFactory } from "./consensusOrderedCollectionFactory.js";
import { IOrderedCollection } from "./interfaces.js";
import { SnapshotableArray } from "./snapshotableArray.js";

/**
 * An JS array based queue implementation that is the backing data structure for ConsensusQueue
 */
class SnapshotableQueue<T> extends SnapshotableArray<T> implements IOrderedCollection<T> {
	public add(value: T) {
		this.data.push(value);
	}

	public remove(): T {
		if (this.size() === 0) {
			throw new Error("SnapshotableQueue is empty");
		}
		return this.data.shift() as T;
	}
}

/**
 * Implementation of a consensus stack
 *
 * An derived type of ConsensusOrderedCollection with a queue as the backing data and order.
 * @alpha
 */
export class ConsensusQueue<T = any> extends ConsensusOrderedCollection<T> {
	/**
	 * Create a new consensus queue
	 *
	 * @param runtime - data store runtime the new consensus queue belongs to
	 * @param id - optional name of theconsensus queue
	 * @returns newly create consensus queue (but not attached yet)
	 */
	public static create<T = any>(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(id, ConsensusQueueFactory.Type) as ConsensusQueue<T>;
	}

	/**
	 * Get a factory for ConsensusQueue to register with the data store.
	 *
	 * @returns a factory that creates and load ConsensusQueue
	 */
	public static getFactory(): IChannelFactory {
		return new ConsensusQueueFactory();
	}

	/**
	 * Constructs a new consensus queue. If the object is non-local an id and service interfaces will
	 * be provided
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, new SnapshotableQueue<T>());
	}
}
