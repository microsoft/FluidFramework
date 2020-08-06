/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime, IChannelAttributes } from "@fluidframework/datastore-definitions";
import { SharedNumberSequenceFactory } from "./sequenceFactory";
import { SharedSequence } from "./sharedSequence";

export class SharedNumberSequence extends SharedSequence<number> {
    /**
     * Create a new shared number sequence
     *
     * @param runtime - data store runtime the new shared number sequence belongs to
     * @param id - optional name of the shared number sequence
     * @returns newly create shared number sequence (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id,
            SharedNumberSequenceFactory.Type) as SharedNumberSequence;
    }

    /**
     * Get a factory for SharedNumberSequence to register with the data store.
     *
     * @returns a factory that creates and load SharedNumberSequence
     */
    public static getFactory() {
        return new SharedNumberSequenceFactory();
    }

    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedNumberSequenceFactory.segmentFromSpec);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
