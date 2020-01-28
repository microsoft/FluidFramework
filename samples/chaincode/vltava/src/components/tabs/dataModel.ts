/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISharedDirectory, IDirectory, IDirectoryValueChanged,
} from "@microsoft/fluid-map";

import uuid from "uuid/v4";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";

export interface ITabsDataModel extends EventEmitter{
    getComponent(id: string): Promise<IComponent>;
    getTabIds(): string[];
    createTab(): Promise<string>;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {

    private readonly tabs: IDirectory;

    constructor(
        root: ISharedDirectory,
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

    public async createTab(): Promise<string> {
        const newId = uuid();

        const component = await this.createAndAttachComponent("newId", "clicker");
        this.tabs.set(newId, component.IComponentHandle);
        this.emit("newTab", true);
        return newId;
    }
}
