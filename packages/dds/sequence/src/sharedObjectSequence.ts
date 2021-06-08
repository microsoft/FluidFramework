/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime, IChannelAttributes, Serializable } from "@fluidframework/datastore-definitions";
import { SharedObjectSequenceFactory } from "./sequenceFactory";
import { SharedSequence } from "./sharedSequence";

/**
 * The SharedObjectSequence holds a sequence of serializable objects. Each object will be stored
 * at a position within the sequence. See the
 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/sequence/README.md | sequence readme}
 * for details on working with sequences.
 */
export class SharedObjectSequence<T> extends SharedSequence<T> {
    /**
     * Create a new shared object sequence
     *
     * @param runtime - data store runtime the new shared object sequence belongs to
     * @param id - optional name of the shared object sequence
     * @returns newly create shared object sequence (but not attached yet)
     */
    // eslint-disable-next-line @typescript-eslint/no-shadow
    public static create<T>(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedObjectSequenceFactory.Type) as SharedObjectSequence<T>;
    }

    /**
     * Get a factory for SharedObjectSequence to register with the data store.
     *
     * @returns a factory that creates and load SharedObjectSequence
     */
    public static getFactory() {
        return new SharedObjectSequenceFactory();
    }

    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedObjectSequenceFactory.segmentFromSpec);
    }

    public getRange(start: number, end?: number): Serializable<T>[] {
        return this.getItems(start, end);
    }
}
