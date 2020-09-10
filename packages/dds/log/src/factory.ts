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
import { SharedLog } from "./log";
import { ISharedLog } from "./types";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the map
 */
export class SharedLogFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/log";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedLogFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedLogFactory.Type;
    }

    public get attributes() {
        return SharedLogFactory.Attributes;
    }

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedLog> {
        const instance = new SharedLog(id, runtime, attributes);
        await instance.load(branchId, services);
        return instance;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedLog {
        const cell = new SharedLog(id, document, this.attributes);
        cell.initializeLocal();
        return cell;
    }
}
