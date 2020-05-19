/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MergeTree from "@microsoft/fluid-merge-tree";
import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@microsoft/fluid-component-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { pkgVersion } from "./packageVersion";
import { SharedNumberSequence } from "./sharedNumberSequence";
import { SharedObjectSequence } from "./sharedObjectSequence";
import { IJSONRunSegment, SubSequence } from "./sharedSequence";
import { SharedString } from "./sharedString";

export class SharedStringFactory implements ISharedObjectFactory {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedStringFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public static segmentFromSpec(spec: any) {
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

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const sharedString = new SharedString(runtime, id, attributes);
        await sharedString.load(branchId, services);
        return sharedString;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedString(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedObjectSequenceFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedObjectSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public static segmentFromSpec(segSpec: MergeTree.IJSONSegment) {
        const runSegment = segSpec as IJSONRunSegment<object>;
        if (runSegment.items) {
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

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const sharedSeq = new SharedObjectSequence<object>(runtime, id, attributes);
        await sharedSeq.load(branchId, services);
        return sharedSeq;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedObjectSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedNumberSequenceFactory implements ISharedObjectFactory {
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

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const sharedSeq = new SharedNumberSequence(runtime, id, attributes);
        await sharedSeq.load(branchId, services);
        return sharedSeq;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}
