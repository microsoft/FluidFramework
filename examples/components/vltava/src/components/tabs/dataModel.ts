/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
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

import uuid from "uuid/v4";

export interface ITabsTypes {
    type: string;
    friendlyName: string;
    fabricIconName: string;
}

export interface ITabsDataModel extends EventEmitter {
    getComponentTab(id: string): Promise<IComponent>;
    getTabIds(): string[];
    createTab(type: string): Promise<string>;
    getNewTabTypes(): ITabsTypes[];
    root: ISharedDirectory;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {

    private readonly tabs: IDirectory;

    constructor(
        public root: ISharedDirectory,
        private readonly internalRegistry: IComponentRegistryDetails,
        private readonly createAndAttachComponent: (pkg: string, props?: any) => Promise<IComponent>,
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
        const newId = uuid();
        const component = await this.createAndAttachComponent(type);
        this.tabs.set(newId, component.IComponentHandle);
        this.emit("newTab", true);
        return newId;
    }

    public getComponentTab(id: string): Promise<IComponent> {
        return this.tabs.get<IComponentHandle<IComponent>>(id).get();
    }

    public getNewTabTypes(): ITabsTypes[] {
        const response: ITabsTypes[] = [];
        this.internalRegistry.getFromCapabilities("IComponentHTMLView").forEach((e) => {
            response.push({
                type: e.type,
                friendlyName: e.friendlyName,
                fabricIconName: e.fabricIconName,
            });
        });
        return response;
    }
}
