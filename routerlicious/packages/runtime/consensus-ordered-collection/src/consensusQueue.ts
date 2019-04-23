import { IComponentRuntime } from "@prague/runtime-definitions";
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

    public remove(): T {
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
     * Constructs a new consensus queue. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(id: string, runtime: IComponentRuntime) {
        super(id, runtime, ConsensusQueueExtension.Type, new SnapshotableQueue<T>());
    }
}
