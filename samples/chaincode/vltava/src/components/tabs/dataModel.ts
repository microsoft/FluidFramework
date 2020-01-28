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
    getTabIds(): Iterable<string>;
    createTab(): string;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {

    private readonly tabs: IDirectory;

    constructor(
        root: ISharedDirectory,
        public readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
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
                if (changed.path === this.tabs.absolutePath) {
                    this.emit("newTab");
                }
            });
    }

    public getTabIds(): Iterable<string>{
        return this.tabs.keys();
    }

    public createTab(): string {
        const newId = uuid();
        this.tabs.set(newId, "");
        this.emit("newTab", newId);
        return uuid();
    }
}
