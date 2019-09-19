/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

/**
 * Consensus Register Collection channel factory interface
 *
 * Extends the base ISharedObjectFactory to return a more definite type of IConsensusRegisterCollection
 * Use for the runtime to create and load distributed data structure by type name of each channel
 */
export interface IConsensusRegisterCollectionFactory extends ISharedObjectFactory {
    load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<IConsensusRegisterCollection>;

    create(document: IComponentRuntime, id: string): IConsensusRegisterCollection;
}

/**
 * Consensus Register Collection.
 *
 * A consensus register collection is a distributed data structure, which holds a set of registers with update
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
 *
 */
export interface IConsensusRegisterCollection<T = any> extends ISharedObject {
    /**
     * Attempts to write a register with a value. Returns a promise to indicate the roundtrip completion.
     * For a non existent register, it will attempt to create a new register with the specified value.
     */
    write(key: string, value: T): Promise<void>;

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

    /**
     * Event listeners
     */
    on(event: "atomicChanged" | "versionChanged", listener: (...args: any[]) => void): this;
}

/**
 * Read policies used when reading the map value.
 */
export enum ReadPolicy {
    // On a concurrent update, returns the first agreed upon value amongst all clients.
    Atomic,

    // Last writer wins. Simply returns the last written value.
    LWW,
}
