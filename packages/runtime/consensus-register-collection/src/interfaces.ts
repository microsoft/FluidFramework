import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension } from "@prague/shared-object-common";

/**
 * Consensus Register Collection channel extension interface
 *
 * Extends the base ISharedObjectExtension to return a more definite type of IConsensusRegisterCollection
 * Use for the runtime to create and load distributed data structure by type name of each channel
 */
export interface IConsensusRegisterCollectionExtension extends ISharedObjectExtension {
    load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<IConsensusRegisterCollection>;

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
 * operation, where we compare a register sequuence number with the incoming reference sequence number.
 * The earliest operation overwriting prior sequence numbers wins since every client reaches to an agreement on
 * the value. So we can safely return the first value.
 *
 * LWW: The last write to a key always wins.
 *
 */
export interface IConsensusRegisterCollection extends ISharedObject {
    /**
     * Attempts to write a register with a value. Returns a promise to indicate the roundtrip completion.
     * For a non existent register, it will attempt to create a new register with the specified value.
     */
    write(key: string, value: any): Promise<void>;

    /**
     * Retrieves the agreed upon value for the register based on policy. Returns undefined if not present.
     */
    read(key: string, policy?: ReadPolicy): any | undefined;

    /**
     * Retrives all concurrent versions. Undefined if not present.
     */
    readVersions(key: string): any[] | undefined;

    /**
     * Returns the keys.
     */
    keys(): string[];
}

export interface ILocalRegister {
    // Register value
    value: IRegisterValue;

    // The sequence number when last consensus was reached.
    sequenceNumber: number;
}

export interface IRegisterValue {
    // Type of the value
    type: string;

    // Actual Value
    value: any;
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

/**
 * Internal enum and interface describing the value serialization
 */

/**
 * The type of serialized object, used describe values in snapshot or operation
 */
export enum RegisterValueType {
    // The value is another shared object
    Shared,

    // The value is a plain JavaScript object
    Plain,
}
