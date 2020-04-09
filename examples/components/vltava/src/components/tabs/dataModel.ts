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
import { SharedComponent } from "@microsoft/fluid-aqueduct";

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
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {

    private tabs: IDirectory;

    constructor(
        public root: ISharedDirectory,
        private readonly internalRegistry: IComponentRegistryDetails,
        private readonly createAndAttachComponent: <T extends IComponent & IComponentLoadable>(pkg: string, props?: any)
        => Promise<T>,
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
        if (component instanceof SharedComponent) {
            this.tabs.set(newId, component.handle);
            this.emit("newTab", true);
            return newId;
        } else {
            throw Error("Please only use Shared and Primed Components in Vltava");
        }
    }

    public async getComponentTab(id: string): Promise<IComponent> {
        this.tabs = this.root.getSubDirectory("tab-ids");
        const handle = this.tabs.get<IComponentHandle>(id);
        if (handle) {
            return handle.get();
        } else {
            throw Error("Tried to render a tab with no created component");
        }
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
