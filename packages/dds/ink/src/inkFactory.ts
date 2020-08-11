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
import { ISharedObject } from "@fluidframework/shared-object-base";
import { Ink } from "./ink";
import { pkgVersion } from "./packageVersion";

/**
 * Factory for Ink.
 * @sealed
 */
export class InkFactory implements IChannelFactory {
    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory."type"}
     */
    public static Type = "https://graph.microsoft.com/types/ink";

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: InkFactory.Type,
        snapshotFormatVersion: "0.2",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory."type"}
     */
    public get type() {
        return InkFactory.Type;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.attributes}
     */
    public get attributes() {
        return InkFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const ink = new Ink(runtime, id, attributes);
        await ink.load(branchId, services);

        return ink;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.create}
     */
    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedObject {
        const ink = new Ink(runtime, id, InkFactory.Attributes);
        ink.initializeLocal();

        return ink;
    }
}
