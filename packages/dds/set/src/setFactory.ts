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
import { SharedSet } from "./set";
import { ISharedSet } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the map
 */
export class SetFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/set";

    public static readonly Attributes: IChannelAttributes = {
        type: SetFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SetFactory.Type;
    }

    public get attributes() {
        return SetFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedSet> {
        const set = new SharedSet(id, runtime, attributes);
        await set.load(services);
        return set;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedSet {
        const set = new SharedSet(id, document, this.attributes);
        set.initializeLocal();
        return set;
    }
}
