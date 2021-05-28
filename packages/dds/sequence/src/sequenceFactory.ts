/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MergeTree from "@fluidframework/merge-tree";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { pkgVersion } from "./packageVersion";
import { SharedNumberSequence } from "./sharedNumberSequence";
import { SharedObjectSequence } from "./sharedObjectSequence";
import { IJSONRunSegment, SubSequence } from "./sharedSequence";
import { SharedString, SharedStringSegment } from "./sharedString";

export class SharedStringFactory implements IChannelFactory {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedStringFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public static segmentFromSpec(spec: any): SharedStringSegment {
        const maybeText = MergeTree.TextSegment.fromJSONObject(spec);
        if (maybeText) { return maybeText; }

        const maybeMarker = MergeTree.Marker.fromJSONObject(spec);
        if (maybeMarker) { return maybeMarker; }
    }

    public get type() {
        return SharedStringFactory.Type;
    }

    public get attributes() {
        return SharedStringFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<SharedString> {
        const sharedString = new SharedString(runtime, id, attributes);
        await sharedString.load(services);
        return sharedString;
    }

    public create(document: IFluidDataStoreRuntime, id: string): SharedString {
        const sharedString = new SharedString(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedObjectSequenceFactory implements IChannelFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedObjectSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public static segmentFromSpec(segSpec: MergeTree.IJSONSegment) {
        // eslint-disable-next-line @typescript-eslint/ban-types
        const runSegment = segSpec as IJSONRunSegment<object>;
        if (runSegment.items) {
            // eslint-disable-next-line @typescript-eslint/ban-types
            const seg = new SubSequence<object>(runSegment.items);
            if (runSegment.props) {
                seg.addProperties(runSegment.props);
            }
            return seg;
        }
    }

    public get type() {
        return SharedObjectSequenceFactory.Type;
    }

    public get attributes() {
        return SharedObjectSequenceFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        // eslint-disable-next-line @typescript-eslint/ban-types
        const sharedSeq = new SharedObjectSequence<object>(runtime, id, attributes);
        await sharedSeq.load(services);
        return sharedSeq;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
        const sharedString = new SharedObjectSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedNumberSequenceFactory implements IChannelFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/number-sequence";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedNumberSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public static segmentFromSpec(segSpec: MergeTree.IJSONSegment) {
        const runSegment = segSpec as IJSONRunSegment<number>;
        if (runSegment.items) {
            const seg = new SubSequence<number>(runSegment.items);
            if (runSegment.props) {
                seg.addProperties(runSegment.props);
            }
            return seg;
        }
    }

    public get type() {
        return SharedNumberSequenceFactory.Type;
    }

    public get attributes() {
        return SharedNumberSequenceFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
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

    public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}
