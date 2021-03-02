/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedOT } from "./ot";
import { ISharedOT } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the map
 */
export class OTFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/OT";

    public static readonly Attributes: IChannelAttributes = {
        type: OTFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return OTFactory.Type;
    }

    public get attributes() {
        return OTFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedOT> {
        const OT = new SharedOT(id, runtime, attributes);
        await OT.load(services);
        return OT;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedOT {
        const OT = new SharedOT(id, document, this.attributes);
        OT.initializeLocal();
        return OT;
    }
}
