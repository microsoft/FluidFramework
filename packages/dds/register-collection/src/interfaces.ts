/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

/**
 * Consensus Register Collection channel factory interface
 *
 * Extends the base IChannelFactory to return a more definite type of IConsensusRegisterCollection
 * Use for the runtime to create and load distributed data structure by type name of each channel.
 * @alpha
 */
export interface IConsensusRegisterCollectionFactory extends IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	load(
		document: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IConsensusRegisterCollection>;

	create(document: IFluidDataStoreRuntime, id: string): IConsensusRegisterCollection;
}

/**
 * Events emitted by {@link IConsensusRegisterCollection}.
 * @alpha
 */
export interface IConsensusRegisterCollectionEvents extends ISharedObjectEvents {
	(
		event: "atomicChanged" | "versionChanged",
		listener: (key: string, value: any, local: boolean) => void,
	);
}

/**
 * A distributed data structure that holds a set of registers with update
 * versions. On concurrent updates, a register internally stores all possible versions of a value by using reference
 * sequence number of the incoming update.
 *
 * Using all the stored versions, we can then distinguish amongst different read policies. Below are the policies
 * we support:
 *
 * Atomic: Atomicity requires a linearizable register. A linearizable register behaves as if there is only a single
 * copy of the data, and that every operation appears to take effect atomically at one point in time. This definition
 * implies that operations are executed in an well-defined order. On a concurrent update, we perform a compare-and-set
 * operation, where we compare a register sequence number with the incoming reference sequence number.
 * The earliest operation overwriting prior sequence numbers wins since every client reaches to an agreement on
 * the value. So we can safely return the first value.
 *
 * LWW: The last write to a key always wins.
 * @alpha
 */
export interface IConsensusRegisterCollection<T = any>
	extends ISharedObject<IConsensusRegisterCollectionEvents> {
	/**
	 * Attempts to write a register with a value. Returns a promise to indicate the roundtrip completion.
	 * For a non existent register, it will attempt to create a new register with the specified value.
	 *
	 * @returns Promise<true> if write was non-concurrent
	 */
	write(key: string, value: T): Promise<boolean>;

	/**
	 * Retrieves the agreed upon value for the register based on policy. Returns undefined if not present.
	 */
	read(key: string, policy?: ReadPolicy): T | undefined;

	/**
	 * Retrives all concurrent versions. Undefined if not present.
	 */
	readVersions(key: string): T[] | undefined;

	/**
	 * Returns the keys.
	 */
	keys(): string[];
}

/**
 * Read policies used when reading the map value.
 * @alpha
 */
export enum ReadPolicy {
	// On a concurrent update, returns the first agreed upon value amongst all clients.
	Atomic,

	// Last writer wins. Simply returns the last written value.
	LWW,
}
