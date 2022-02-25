/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
    FluidObject,
    IFluidHandle,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import {
    ISharedDirectory,
    IDirectory,
    IValueChanged,
} from "@fluidframework/map";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

import { v4 as uuid } from "uuid";

import { IFluidObjectInternalRegistry } from "../../interfaces";

export interface ITabsTypes {
    friendlyName: string;
    fabricIconName: string;
    factory: IFluidDataStoreFactory;
}

export interface ITabsModel {
    type: string;
    handle: IFluidHandle;
}

export interface ITabsDataModel extends EventEmitter {
    getFluidObjectTab(id: string): Promise<FluidObject | undefined>;
    getTabIds(): string[];
    createTab(factory: IFluidDataStoreFactory): Promise<string>;
    getNewTabTypes(): ITabsTypes[];
    getFluidObjectTabView(id: string): Promise<JSX.Element>;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {
    private readonly tabs: IDirectory;

    constructor(
        public root: ISharedDirectory,
        private readonly internalRegistry: IFluidObjectInternalRegistry,
        private readonly createSubObject: (factory: IFluidDataStoreFactory) => Promise<IFluidLoadable>,
        private readonly getFluidObjectFromDirectory: <T extends FluidObject & IFluidLoadable>(
            id: string,
            directory: IDirectory,
            getObjectFromDirectory?: (id: string, directory: IDirectory) => IFluidHandle | undefined) =>
            Promise<T | undefined>,
    ) {
        super();

        const tabs = "tab-ids";
        if (!root.hasSubDirectory(tabs)) {
            root.createSubDirectory(tabs);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.tabs = root.getSubDirectory(tabs)!;

        this.tabs.on(
            "containedValueChanged",
            (
                changed: IValueChanged,
                local: boolean,
            ) => {
                this.emit("newTab", local);
            });
    }

    public getTabIds(): string[] {
        return Array.from(this.tabs.keys());
    }

    public async createTab(factory: IFluidDataStoreFactory): Promise<string> {
        const newKey = uuid();
        const fluidObject = await this.createSubObject(factory);
        this.tabs.set(newKey, {
            type: factory.type,
            handle: fluidObject.handle,
        });

        return newKey;
    }

    private getObjectFromDirectory(id: string, directory: IDirectory): IFluidHandle | undefined {
        const data = directory.get<ITabsModel>(id);
        return data?.handle;
    }

    public async getFluidObjectTab(id: string): Promise<FluidObject | undefined> {
        return this.getFluidObjectFromDirectory(id, this.tabs, this.getObjectFromDirectory);
    }

    public async getFluidObjectTabView(id: string): Promise<JSX.Element> {
        const objectWithMetadata = this.tabs.get<ITabsModel>(id);
        if (objectWithMetadata === undefined) {
            throw new Error("Tab not found");
        }
        const registryEntry = this.internalRegistry.getByFactory(objectWithMetadata.type);
        if (registryEntry === undefined) {
            throw new Error("Tab of unknown type");
        }

        // Could be typed stronger, but getView just expects the passed object to have a .handle
        return registryEntry.getView(objectWithMetadata);
    }

    public getNewTabTypes(): ITabsTypes[] {
        const response: ITabsTypes[] = [];
        this.internalRegistry.getAll().forEach((e) => {
            response.push({
                friendlyName: e.friendlyName,
                fabricIconName: e.fabricIconName,
                factory: e.factory,
            });
        });
        return response;
    }
}
