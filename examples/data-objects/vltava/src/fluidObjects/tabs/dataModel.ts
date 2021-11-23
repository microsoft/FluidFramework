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

import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { IFluidObjectInternalRegistry } from "../../interfaces";

export interface ITabsTypes {
    friendlyName: string;
    fabricIconName: string;
    factory: IFluidDataStoreFactory;
}

export interface ITabsModel {
    type: string;
    handleOrId?: IFluidHandle | string;
}

export interface ITabsDataModel extends EventEmitter {
    getFluidObjectTab(id: string): Promise<FluidObject | undefined>;
    getTabIds(): string[];
    createTab(factory: IFluidDataStoreFactory): Promise<string>;
    getNewTabTypes(): ITabsTypes[];
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
            getObjectFromDirectory?: (id: string, directory: IDirectory) => string | IFluidHandle | undefined) =>
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
            handleOrId: fluidObject.handle,
        });

        return newKey;
    }

    private getObjectFromDirectory(id: string, directory: IDirectory): string | IFluidHandle | undefined {
        const data = directory.get<ITabsModel>(id);
        return data?.handleOrId;
    }

    public async getFluidObjectTab(id: string): Promise<FluidObject | undefined> {
        return this.getFluidObjectFromDirectory(id, this.tabs, this.getObjectFromDirectory);
    }

    public getNewTabTypes(): ITabsTypes[] {
        const response: ITabsTypes[] = [];
        this.internalRegistry.getFromCapability(IFluidHTMLView).forEach((e) => {
            response.push({
                friendlyName: e.friendlyName,
                fabricIconName: e.fabricIconName,
                factory: e.factory,
            });
        });
        return response;
    }
}
