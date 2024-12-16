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
import {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * @legacy
 * @alpha
 */
export enum ConsensusResult {
	Release,
	Complete,
}

/**
 * Callback provided to acquire() and waitAndAcquire() methods.
 * @returns ConsensusResult indicating whether item was completed, or releases back to the queue.
 * @legacy
 * @alpha
 */
export type ConsensusCallback<T> = (value: T) => Promise<ConsensusResult>;

/**
 * Consensus Ordered Collection channel factory interface
 *
 * Extends the base IChannelFactory to return a more definite type of IConsensusOrderedCollection
 * Use for the runtime to create and load distributed data structure by type name of each channel
 * @internal
 */
export interface IConsensusOrderedCollectionFactory extends IChannelFactory {
	load(
		document: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IConsensusOrderedCollection>;

	create(document: IFluidDataStoreRuntime, id: string): IConsensusOrderedCollection;
}

/**
 * Events notifying about addition, acquisition, release and completion of items
 * @legacy
 * @alpha
 */
export interface IConsensusOrderedCollectionEvents<T> extends ISharedObjectEvents {
	/**
	 * Event fires when new item is added to the queue or
	 * an item previously acquired is returned back to a queue (including client loosing connection)
	 * @param newlyAdded - indicates if it's newly added item of previously acquired item
	 */
	(event: "add", listener: (value: T, newlyAdded: boolean) => void): this;
	/**
	 * Event fires when a client acquired an item
	 * Fires both for locally acquired items, as well as items acquired by remote clients
	 */
	(event: "acquire", listener: (value: T, clientId?: string) => void): this;

	/**
	 * "Complete event fires when a client completes an item.
	 */
	(event: "complete", listener: (value: T) => void): this;

	/**
	 * Event fires when locally acquired item is being released back to the queue.
	 * Please note that release process is asynchronous, so it takes a while for it to happen
	 * ("add" event will be fired as result of it)
	 * @param intentional - indicates whether release was intentional (result of returning
	 * ConsensusResult.Release from callback) or it happened as result of lost connection.
	 */
	(event: "localRelease", listener: (value: T, intentional: boolean) => void): this;
}

/**
 * Consensus Ordered Collection interface
 *
 * An consensus ordered collection is a distributed data structure, which
 * holds a collection of JSON-able or handles, and has a
 * deterministic add/remove order.
 *
 * @remarks
 * The order the server receive the add/remove operation determines the
 * order those operation are applied to the collection. Different clients
 * issuing `add` or `acquire` operations at the same time will be sequenced.
 * The order dictates which `add` is done first, thus determining the order
 * in which it appears in the collection.  It also determines which client
 * will get the first removed item, etc. All operations are asynchronous.
 * A function `waitAndAcquire` is provided to wait for and remove an entry in the collection.
 *
 * As a client acquires an item, it processes it and then returns a value (via callback)
 * indicating whether it has completed processing the item, or whether the item should be
 * released back to the collection for another client to process.
 *
 * All objects added to the collection will be cloned (via JSON).
 * They will not be references to the original input object.  Thus changed to
 * the input object will not reflect the object in the collection.
 * @legacy
 * @alpha
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IConsensusOrderedCollection<T = any>
	extends ISharedObject<IConsensusOrderedCollectionEvents<T>> {
	/**
	 * Adds a value to the collection
	 */
	add(value: T): Promise<void>;

	/**
	 * Retrieves a value from the collection.
	 * @returns Returns true (and calls callback with acquired value) if collection was not empty.
	 * Otherwise returns false.
	 */
	acquire(callback: ConsensusCallback<T>): Promise<boolean>;

	/**
	 * Wait for a value to be available and remove it from the consensus collection
	 * Calls callback with retrieved value.
	 */
	waitAndAcquire(callback: ConsensusCallback<T>): Promise<void>;
}

/**
 * Interface for object that can be snapshoted
 *
 * TODO: move this to be use in other place
 * TODO: currently input and output is not symmetrical, can they become symmetrical?
 * @legacy
 * @alpha
 */
export interface ISnapshotable<T> {
	asArray(): T[];

	loadFrom(values: T[]): void;
}

/**
 * Ordered Collection interface
 *
 * Collection of objects that has deterministic add and remove ordering.
 * Object implementing this interface can be used as the data backing
 * for the ConsensusOrderedCollection
 * @legacy
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IOrderedCollection<T = any> extends ISnapshotable<T> {
	/**
	 * Adds a value to the collection
	 */
	add(value: T);

	/**
	 * Retrieves a value from the collection.
	 */
	remove(): T;

	/**
	 * Return the size of the collection
	 */
	size(): number;
}
