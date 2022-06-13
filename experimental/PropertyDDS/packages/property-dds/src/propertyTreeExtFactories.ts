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
import { SharedPropertyTreeOptions } from "./propertyTree";
import { CompressedCommPropertyTree } from "./propertyTreeExt";

export class CompressedCommPropertyTreeFactory implements IChannelFactory {
    public static readonly Type = "CompressedPropertyTree:84534a0fe613522101f6";

    public static readonly Attributes: IChannelAttributes = {
        type: CompressedCommPropertyTreeFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: "0.0.1",
    };

    public get type() {
        return CompressedCommPropertyTreeFactory.Type;
    }

    public get attributes() {
        return CompressedCommPropertyTreeFactory.Attributes;
    }

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
        url?: string,
    ): Promise<CompressedCommPropertyTree> {
        const options = {};
        const instance = new CompressedCommPropertyTree(id, runtime, attributes, options as SharedPropertyTreeOptions);
        await instance.load(services);
        return instance;
    }

    public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): CompressedCommPropertyTree {
        const options = {};
        const cell = new CompressedCommPropertyTree(id, document,
            this.attributes, options as SharedPropertyTreeOptions);
        cell.initializeLocal();
        return cell;
    }
}
