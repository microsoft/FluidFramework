/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import {
    ISharedDirectory,
    IDirectory,
    IDirectoryValueChanged,
} from "@microsoft/fluid-map";
import {
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import {
    IComponentRegistryDetails,
} from "@fluid-example/spaces";

import { v4 as uuid } from "uuid";

export interface ITabsTypes {
    type: string;
    friendlyName: string;
    fabricIconName: string;
}

export interface ITabsModel {
    type: string;
    handleOrId?: IComponentHandle | string;
}

export interface ITabsDataModel extends EventEmitter {
    getComponentTab(id: string): Promise<IComponent | undefined>;
    getTabIds(): string[];
    createTab(type: string): Promise<string>;
    getNewTabTypes(): ITabsTypes[];
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {
    private tabs: IDirectory;

    constructor(
        public root: ISharedDirectory,
        private readonly internalRegistry: IComponentRegistryDetails,
        private readonly createAndAttachComponent: <T extends IComponent & IComponentLoadable>
        (pkg: string, props?: any) => Promise<T>,
        private readonly getComponentFromDirectory: <T extends IComponent & IComponentLoadable>(
            id: string,
            directory: IDirectory,
            getObjectFromDirectory?: (id: string, directory: IDirectory) => string | IComponentHandle | undefined) =>
        Promise<T | undefined>,
    ) {
        super();

        this.tabs = root.getSubDirectory("tab-ids");

        root.on(
            "valueChanged",
            (
                changed: IDirectoryValueChanged,
                local: boolean,
                op: ISequencedDocumentMessage,
                target: ISharedDirectory,
            ) => {
                if (changed.path === this.tabs.absolutePath && !local) {
                    this.emit("newTab", local);
                }
            });
    }

    public getTabIds(): string[] {
        return Array.from(this.tabs.keys());
    }

    public async createTab(type: string): Promise<string> {
        const newKey = uuid();
        const component = await this.createAndAttachComponent<IComponent & IComponentLoadable>(type);
        this.tabs.set(newKey, {
            type,
            handleOrId: component.handle,
        });

        this.emit("newTab", true);
        return newKey;
    }

    private getObjectFromDirectory(id: string, directory: IDirectory): string | IComponentHandle | undefined {
        const data = directory.get<ITabsModel>(id);
        return data?.handleOrId;
    }

    public async getComponentTab(id: string): Promise<IComponent | undefined> {
        this.tabs = this.root.getSubDirectory("tab-ids");
        return this.getComponentFromDirectory(id, this.tabs, this.getObjectFromDirectory);
    }

    public getNewTabTypes(): ITabsTypes[] {
        const response: ITabsTypes[] = [];
        this.internalRegistry.getFromCapability("IComponentHTMLView").forEach((e) => {
            response.push({
                type: e.type,
                friendlyName: e.friendlyName,
                fabricIconName: e.fabricIconName,
            });
        });
        return response;
    }
}
