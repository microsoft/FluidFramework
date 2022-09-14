/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle, IFluidRouter } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { IRemovedHandle } from "./channelHandler";
import { IChannelPath } from "./handlesTracker";
import { DataObjectManyDDSes } from "./testDataObjects";
import { IFluidObjectPath } from "./fluidObjectTracker";

/**
 * ContainerDataObjectManager is responsible for:
 * - retrieval and creation of DataObjects
 * - retrieval of handles to DataObjects and their DDSes
 * - adding handles to DataObjects' DDSes
 */
export class ContainerDataObjectManager {
    private readonly dataStoreType: string = DataObjectManyDDSes.type;

    constructor(private readonly container: IContainer) {}

    public async createDataObject(): Promise<DataObjectManyDDSes> {
        const defaultDataStore = await this.getDataObjectFromRoute(this.container, "default");
        const newDataStore = await defaultDataStore.containerRuntime.createDataStore(this.dataStoreType);
        const newDataObject = await this.getDataObjectFromRoute(newDataStore, "");
        return newDataObject;
    }

    /**
     * @param handlePath - is the path from the container to the handle
     * @returns an IFluidHandle of the given path
     */
    public async getHandle(handlePath: IFluidObjectPath): Promise<IFluidHandle> {
        const dataObject = await this.getDataObjectFromRoute(this.container, `/${handlePath.dataStoreId}`);
        if (handlePath.ddsId === undefined) {
            return dataObject.handle;
        }
        const handle = dataObject._root.get<IFluidHandle>(handlePath.ddsId);
        assert(handle !== undefined, "Handle should exist in handle path! And it should be retrievable!");
        return handle;
    }

    public async addHandle(channelPath: IChannelPath, handle: IFluidHandle, random: IRandom) {
        const dataObject = await this.getDataObjectFromRoute(this.container, channelPath.dataStoreId);
        return dataObject.addHandleOpForChannel(channelPath.ddsId, handle, random);
    }

    public async removeHandle(handlePath: IChannelPath, random: IRandom): Promise<IRemovedHandle> {
        const dataObject = await this.getDataObjectFromRoute(this.container, handlePath.dataStoreId);
        return dataObject.removeHandleForChannel(handlePath.ddsId, random);
    }

    // For now, the request pattern is being used, this should eventually be updated to retrieve DataObjects/DDSes
    // by calling handle.get and retrieving the underlying object.
    private async getDataObjectFromRoute(router: IFluidRouter, route: string) {
        const dataObject = await requestFluidObject<DataObjectManyDDSes>(router, route);
        return dataObject;
    }
}
