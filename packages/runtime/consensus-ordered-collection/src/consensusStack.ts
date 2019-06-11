import { IComponentRuntime } from "@prague/runtime-definitions";
import { ConsensusOrderedCollection } from "./consensusOrderedCollection";
import { ConsensusStackExtension } from "./extension";
import { IOrderedCollection } from "./interfaces";
import { SnapshotableArray } from "./snapshotableArray";

/**
 * An JS array based stack implementation that is the backing data structure for ConsensusStack
 */
class SnapshotableStack<T> extends SnapshotableArray<T> implements IOrderedCollection<T> {
    public add(value: T) {
        this.data.push(value);
    }

    public remove(): T | undefined {
        return this.data.pop();
    }
}

/**
 * Implementation of a consensus stack
 *
 * An derived type of ConsensusOrderedCollection with a queue as the backing data and order.
 */
export class ConsensusStack<T> extends ConsensusOrderedCollection<T> {
    /**
     * Constructs a new consensus stack. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(id: string, runtime: IComponentRuntime) {
        super(id, runtime, ConsensusStackExtension.Type, new SnapshotableStack<T>());
    }
}
