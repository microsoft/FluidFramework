import { ISharedObject, ISharedObjectExtension } from "@prague/api-definitions";
import { IComponentRuntime, IDistributedObjectServices } from "@prague/runtime-definitions";

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
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IConsensusRegisterCollection>;

    create(document: IComponentRuntime, id: string): IConsensusRegisterCollection;
}

/**
 * Consensus Register Collection.
 *
 * An consensus register collection is a distributed data structure, which holds a set of linearizable registers.
 * A linearizable register behaves as if there is only a single copy of the data, and that every operation appears
 * to take effect atomically at one point in time. This definition implies that operations are executed in
 * an well-defined order.
 *
 * Any operation on a register is guranteed to be atomic. On a concurrent update, we perform a compare-and-set
 * operation, where we compare with the reference sequence number of the current value. On a collision, the earliest
 * operation wins and every client reaches to an agreement on the value. The sequence number when agreement was
 * reached is stored and that will be used on the next update.
 *
 * All non-distributed object added to the collection will be cloned (via JSON).
 * They will not be references to the original input object.  Thus changed to
 * the input object will not reflect the object in the collection.
 */
export interface IConsensusRegisterCollection extends ISharedObject {
    /**
     * Attempts to write a register with a value. Returns a promise to indicate the roundtrip completion.
     * For a non existent register, it will attempt to create a new register with the specified value.
     */
    write(key: string, value: any): Promise<void>;

    /**
     * Retrieves the agreed upon value for the register. Returns undefined if not present.
     */
    read(key: string): any;
}

export interface IRegisterState {
    // Type of the value
    type: string;

    // Actual Value
    value: any;

    // The sequence number when last consensus was reached. 'null' during creation of a new one
    referenceSequenceNumber: number;
}

/**
 * Internal enum and interface describing the value serialization
 *
 * TODO: Refactor this to be common across how distributed data type handle values.
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
