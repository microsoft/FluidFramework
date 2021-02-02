/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as MergeTree from "@fluidframework/merge-tree";
import { IChannelAttributes, IChannelServices,
    IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { SharedString } from "@fluidframework/sequence";
import { pkgVersion } from "./packageVersion";
import { createStringWithSequentialIdFactory } from "./sharedStringWithSequentialId";

export class SharedStringWithSequentialIdFactory implements IChannelFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/sequential-id-sharedstring";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedStringWithSequentialIdFactory.Type,
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
        return SharedStringWithSequentialIdFactory.Type;
    }

    public get attributes() {
        return SharedStringWithSequentialIdFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<SharedString> {
        const sharedStringWithSequentialIdClass = createStringWithSequentialIdFactory(this);
        const sharedString = new sharedStringWithSequentialIdClass(runtime, id, this.attributes);
        await sharedString.load(services);
        return sharedString;
    }

    public create(document: IFluidDataStoreRuntime, id: string): SharedString {
        const sharedStringWithSequentialIdClass = createStringWithSequentialIdFactory(this);
        const sharedString = new sharedStringWithSequentialIdClass(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}
