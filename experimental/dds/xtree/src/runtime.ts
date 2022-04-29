/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannel,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { pkgVersion } from "./packageVersion";
import { SharedXTree } from "./tree";

export class SharedXTreeFactory implements IChannelFactory {
    public static Type = "https://graph.microsoft.com/types/sharedxtree";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedXTreeFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedXTreeFactory.Type;
    }

    public get attributes() {
        return SharedXTreeFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
    ): Promise<IChannel> {
        const instance = new SharedXTree(runtime, id, attributes);
        await instance.load(services);
        return instance;
    }

    public create(document: IFluidDataStoreRuntime, id: string): IChannel {
        const instance = new SharedXTree(document, id, this.attributes);
        instance.initializeLocal();
        return instance;
    }
}
