/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime, IChannelAttributes } from "@fluidframework/datastore-definitions";
import { SharedSequence } from "@fluidframework/sequence";
import { SharedNumberSequenceFactory } from "./sequenceFactory";

/**
 * The SharedNumberSequence holds a sequence of numbers. Each number will be stored
 * at a position within the sequence. See the
 * {@link https://fluidframework.com/docs/data-structures/sequences/ | sequence documentation}
 * for details on working with sequences.
 *
 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 */
export class SharedNumberSequence extends SharedSequence<number> {
    /**
     * Create a new shared number sequence
     *
     * @param runtime - data store runtime the new shared number sequence belongs to
     * @param id - optional name of the shared number sequence
     * @returns newly create shared number sequence (but not attached yet)
     *
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id,
            SharedNumberSequenceFactory.Type) as SharedNumberSequence;
    }

    /**
     * Get a factory for SharedNumberSequence to register with the data store.
     *
     * @returns a factory that creates and load SharedNumberSequence
     *
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static getFactory() {
        return new SharedNumberSequenceFactory();
    }

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, (spec) => {
            const segment = SharedNumberSequenceFactory.segmentFromSpec(spec);
            if (!segment) {
                throw new Error("expected `spec` to be valid `ISegment`");
            }
            return segment;
        });
    }

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
