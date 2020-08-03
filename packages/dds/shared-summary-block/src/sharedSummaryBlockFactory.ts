/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-runtime-definitions";
import {
    ISharedObject,
} from "@fluidframework/shared-object-base";
import { pkgVersion } from "./packageVersion";
import { SharedSummaryBlock } from "./sharedSummaryBlock";

/**
 * The factory that defines the shared summary block.
 * @sealed
 */
export class SharedSummaryBlockFactory implements IChannelFactory {
    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/shared-summary-block";

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: SharedSummaryBlockFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory."type"}
     */
    public get type() {
        return SharedSummaryBlockFactory.Type;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.attributes}
     */
    public get attributes() {
        return SharedSummaryBlockFactory.Attributes;
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
        const sharedSummaryBlock = new SharedSummaryBlock(id, runtime, attributes);
        await sharedSummaryBlock.load(branchId, services);

        return sharedSummaryBlock;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#IChannelFactory.create}
     */
    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedObject {
        const sharedSummaryBlock = new SharedSummaryBlock(id, runtime, SharedSummaryBlockFactory.Attributes);
        sharedSummaryBlock.initializeLocal();

        return sharedSummaryBlock;
    }
}
