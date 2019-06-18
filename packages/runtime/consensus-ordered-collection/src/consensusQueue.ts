import { IComponentRuntime } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { ConsensusOrderedCollection } from "./consensusOrderedCollection";
import { ConsensusQueueExtension } from "./extension";
import { IOrderedCollection } from "./interfaces";
import { SnapshotableArray } from "./snapshotableArray";

/**
 * An JS array based queue implementation that is the backing data structure for ConsensusQueue
 */
class SnapshotableQueue<T> extends SnapshotableArray<T> implements IOrderedCollection<T> {
    public add(value: T) {
        this.data.push(value);
    }

    public remove(): T | undefined {
        return this.data.shift();
    }
}

/**
 * Implementation of a consensus stack
 *
 * An derived type of ConsensusOrderedCollection with a queue as the backing data and order.
 */
export class ConsensusQueue<T = any> extends ConsensusOrderedCollection<T> {
    /**
     * Create a new consensus queue
     *
     * @param runtime - component runtime the new consensus queue belongs to
     * @param id - optional name of theconsensus queue
     * @returns newly create consensus queue (but not attached yet)
     */
    public static create<T = any>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(ConsensusOrderedCollection.getIdForCreate(id),
            ConsensusQueueExtension.Type) as ConsensusQueue<T>;
    }

    /**
     * Get a factory for ConsensusQueue to register with the component.
     *
     * @returns a factory that creates and load ConsensusQueue
     */
    public static getFactory(): ISharedObjectExtension {
        return new ConsensusQueueExtension();
    }

    /**
     * Constructs a new consensus queue. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(id: string, runtime: IComponentRuntime) {
        super(id, runtime, ConsensusQueueExtension.Type, new SnapshotableQueue<T>());
    }
}
