/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    IJSONSegment,
} from "@fluidframework/merge-tree";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { IJSONRunSegment, SubSequence } from "@fluidframework/sequence";
import { pkgVersion } from "./packageVersion";
import { SharedNumberSequence } from "./sharedNumberSequence";
import { SharedObjectSequence } from "./sharedObjectSequence";

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
    public static segmentFromSpec(segSpec: IJSONSegment): SubSequence<object> {
        const runSegment = segSpec as IJSONRunSegment<object>;
        if (runSegment.items) {
            const seg = new SubSequence<object>(runSegment.items);
            if (runSegment.props) {
                seg.addProperties(runSegment.props);
            }
            return seg;
        }

        throw new Error(`Unrecognized IJSONObject`);
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

/**
 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 */
export class SharedNumberSequenceFactory implements IChannelFactory {
    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static Type = "https://graph.microsoft.com/types/mergeTree/number-sequence";

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static readonly Attributes: IChannelAttributes = {
        type: SharedNumberSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public static segmentFromSpec(segSpec: IJSONSegment): SubSequence<number> {
        const runSegment = segSpec as IJSONRunSegment<number>;
        if (runSegment.items) {
            const seg = new SubSequence<number>(runSegment.items);
            if (runSegment.props) {
                seg.addProperties(runSegment.props);
            }
            return seg;
        }

        throw new Error(`Unrecognized IJSONObject`);
    }

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public get type() {
        return SharedNumberSequenceFactory.Type;
    }

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public get attributes() {
        return SharedNumberSequenceFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     *
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const sharedSeq = new SharedNumberSequence(runtime, id, attributes);
        await sharedSeq.load(services);
        return sharedSeq;
    }

    /**
     * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
     * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
     */
    public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}
