/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISharedDirectory,
    IDirectory,
    IDirectoryValueChanged,
} from "@microsoft/fluid-map";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";

import uuid from "uuid/v4";

import { IComponentRegistryDetails } from "../../interfaces";

export interface ITabsTypes {
    type: string;
    friendlyName: string;
    fabricIconName: string;
}

export interface ITabsDataModel extends EventEmitter{
    getComponent(id: string): Promise<IComponent>;
    getTabIds(): string[];
    createTab(type: string): Promise<string>;
    getNewTabTypes(): ITabsTypes[];

    on(event: "newTab", listener: (local: boolean) => void): this;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {

    private readonly tabs: IDirectory;

    public on(event: "newTab", listener: (local: boolean) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    constructor(
        root: ISharedDirectory,
        private readonly internalRegistry: IComponentRegistryDetails,
        private readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        public getComponent: (id: string) => Promise<IComponent>,
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
        const component = await this.createAndAttachComponent(newId, type);
        this.tabs.set(newId, component.IComponentHandle);
        this.emit("newTab", true);
        return newId;
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
