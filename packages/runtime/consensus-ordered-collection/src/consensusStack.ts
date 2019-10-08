/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { ConsensusOrderedCollection } from "./consensusOrderedCollection";
import { ConsensusStackFactory } from "./consensusOrderedCollectionFactory";
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
export class ConsensusStack<T = any> extends ConsensusOrderedCollection<T> {
    /**
     * Create a new consensus stack
     *
     * @param runtime - component runtime the new consensus stack belongs to
     * @param id - optional name of the consensus stack
     * @returns newly create consensus stack (but not attached yet)
     */
    public static create<T = any>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, ConsensusStackFactory.Type) as ConsensusStack<T>;
    }

    /**
     * Get a factory for ConsensusStack to register with the component.
     *
     * @returns a factory that creates and load ConsensusStack
     */
    public static getFactory(): ISharedObjectFactory {
        return new ConsensusStackFactory();
    }

    /**
     * Constructs a new consensus stack. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(id: string, runtime: IComponentRuntime) {
        super(id, runtime, ConsensusStackFactory.Attributes, new SnapshotableStack<T>());
    }
}
