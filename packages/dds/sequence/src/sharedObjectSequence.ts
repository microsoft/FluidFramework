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
 * {@link https://fluidframework.com/docs/data-structures/sequences/ | sequence documentation}
 * for details on working with sequences.
 *
 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 */
export class SharedObjectSequence<T> extends SharedSequence<T> {
    /**
     * Create a new shared object sequence
     *
     * @param runtime - data store runtime the new shared object sequence belongs to
     * @param id - optional name of the shared object sequence
     * @returns newly create shared object sequence (but not attached yet)
     *
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */

    public static create<T>(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedObjectSequenceFactory.Type) as SharedObjectSequence<T>;
    }

    /**
     * Get a factory for SharedObjectSequence to register with the data store.
     *
     * @returns a factory that creates and load SharedObjectSequence
     *
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static getFactory() {
        return new SharedObjectSequenceFactory();
    }

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedObjectSequenceFactory.segmentFromSpec);
    }

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public getRange(start: number, end?: number): Serializable<T>[] {
        return this.getItems(start, end);
    }
}
