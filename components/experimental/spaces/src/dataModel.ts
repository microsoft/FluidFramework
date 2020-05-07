/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedDirectory, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import {
    IComponent, IComponentLoadable, IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { Layout } from "react-grid-layout";
import { IComponentCollectorSpaces, ISpacesCollectible } from "./interfaces";

export interface ISpacesDataModel extends EventEmitter {
    readonly componentList: Map<string, ISpacesModel>;
    getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined>;
    addFormattedComponents(componentModels: ISpacesModel[]): Promise<void>;
    updateGridItem(id: string, newLayout: Layout): void;
    getModels(): ISpacesModel[];
    IComponentCollectorSpaces: IComponentCollectorSpaces;
    addItem(item: ISpacesCollectible): string;
    removeItem(key: string): void;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter
    implements ISpacesDataModel, IComponentCollectorSpaces {
    private readonly componentSubDirectory: IDirectory;

    constructor(
        private readonly root: ISharedDirectory,
    ) {
        super();

        this.componentSubDirectory = this.root.getSubDirectory("component-list");

        root.on("valueChanged", (changed: IDirectoryValueChanged, local: boolean) => {
            // If we don't have this then moving locally is broken
            if (changed.path === this.componentSubDirectory.absolutePath) {
                this.emit("componentListChanged", this.componentList);
            }
        });
    }

    public get IComponentCollectorSpaces() { return this; }

    public addItem(item: ISpacesCollectible): string {
        if (item.component.handle === undefined) {
            throw new Error(`Component must have a handle: ${item.type}`);
        }
        const model: ISpacesModel = {
            type: item.type,
            layout: item.layout ?? { x: 0, y: 0, w: 6, h: 2 },
            handle: item.component.handle,
        };
        this.componentSubDirectory.set(item.component.url, model);
        return item.component.url;
    }

    public removeItem(key: string): void {
        this.componentSubDirectory.delete(key);
    }

    /**
     * Registers a listener on the specified events
     */
    public on(
        event: "componentListChanged",
        listener: (componentIds: Map<string, Layout>) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public get componentList(): Map<string, ISpacesModel> {
        const response: Map<string, Layout> = new Map();
        this.componentSubDirectory.forEach((value: ISpacesModel, key) => {
            response.set(key, value);
        });
        return response;
    }

    public async addFormattedComponents(componentModels: ISpacesModel[]): Promise<void> {
        const components = await Promise.all(componentModels.map(async (model) => model.handle.get()));
        components.forEach((component, index) => {
            this.addItem({
                component,
                type: componentModels[index].type,
                layout: componentModels[index].layout,
            });
        });
    }

    public updateGridItem(id: string, newLayout: Layout): void {
        const currentEntry = this.componentSubDirectory.get<ISpacesModel>(id);
        const model = {
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
            handle: currentEntry.handle,
        };
        this.componentSubDirectory.set(id, model);
    }

    // Needs to return something that can be handled by a ReactViewAdapter.  View doesn't really care how it got there.
    public async getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined> {
        // handle gets the data model for the component.  But the ISpacesModel could include a view...?
        return this.componentSubDirectory.get<ISpacesModel>(id)?.handle.get() as Promise<T>;
    }

    public getModels(): ISpacesModel[] {
        return [...this.componentSubDirectory.values()];
    }
}

export interface ISpacesModel {
    type: string;
    layout: Layout;
    handle: IComponentHandle;
}
