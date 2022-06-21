/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidDataStoreRuntime,
    IChannelAttributes,
    IChannelFactory,
    IChannelServices,
    Serializable,
} from "@fluidframework/datastore-definitions";
import {
    IJSONSegment,
} from "@fluidframework/merge-tree";
import {
    IJSONRunSegment,
    SharedSequence,
    SubSequence,
 } from "@fluidframework/sequence";

import { ISharedObject } from "@fluidframework/shared-object-base";
import { pkgVersion } from "./packageVersion";

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

/**
 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 */
 export class SharedObjectSequenceFactory implements IChannelFactory {
    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static readonly Attributes: IChannelAttributes = {
        type: SharedObjectSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static segmentFromSpec(segSpec: IJSONSegment) {
        const runSegment = segSpec as IJSONRunSegment<object>;
        if (runSegment.items) {
            const seg = new SubSequence<object>(runSegment.items);
            if (runSegment.props) {
                seg.addProperties(runSegment.props);
            }
            return seg;
        }
    }

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public get type() {
        return SharedObjectSequenceFactory.Type;
    }

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public get attributes() {
        return SharedObjectSequenceFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     *
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const sharedSeq = new SharedObjectSequence<object>(runtime, id, attributes);
        await sharedSeq.load(services);
        return sharedSeq;
    }

    /**
     * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
        const sharedString = new SharedObjectSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}
