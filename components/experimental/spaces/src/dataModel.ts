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
import { IComponentCollectorSpaces, ISpacesCollectible, SpacesCompatibleToolbar } from "./interfaces";

const ComponentToolbarKey = "component-toolbar";

export interface ISpacesDataModel extends EventEmitter {
    readonly componentList: Map<string, Layout>;
    addComponent(component: IComponent & IComponentLoadable, type: string, layout: Layout): string;
    getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined>;
    removeComponent(id: string): void;
    addFormattedComponents(componentModels: ISpacesModel[]): Promise<void>;
    setComponentToolbar(toolbarComponent: SpacesCompatibleToolbar): void;
    getComponentToolbar(): Promise<SpacesCompatibleToolbar | undefined>;
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
        return this.addComponent(item.component, item.type, item.layout ?? { x: 0, y: 0, w: 6, h: 2 });
    }

    public removeItem(key: string): void {
        this.removeComponent(key);
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

    public get componentList(): Map<string, Layout> {
        const response: Map<string, Layout> = new Map();
        this.componentSubDirectory.forEach((value: ISpacesModel, key) => {
            response.set(key, value.layout);
        });
        return response;
    }

    public async addFormattedComponents(componentModels: ISpacesModel[]): Promise<void> {
        const components = await Promise.all(componentModels.map(async (model) => model.handle.get()));
        components.forEach((component, index) => {
            this.addComponent(component, componentModels[index].type, componentModels[index].layout);
        });
    }

    public setComponentToolbar(toolbarComponent: SpacesCompatibleToolbar): void {
        if (toolbarComponent.handle === undefined) {
            throw new Error(`Toolbar component must have a handle.`);
        }
        this.root.set(ComponentToolbarKey, toolbarComponent.handle);
    }

    public async getComponentToolbar(): Promise<SpacesCompatibleToolbar | undefined> {
        return this.root.get<IComponentHandle<SpacesCompatibleToolbar> | undefined>(ComponentToolbarKey)?.get();
    }

    public addComponent(component: IComponent & IComponentLoadable, type: string, layout: Layout): string {
        if (component.handle === undefined) {
            throw new Error(`Component must have a handle: ${type}`);
        }
        const model: ISpacesModel = {
            type,
            layout,
            handle: component.handle,
        };
        this.componentSubDirectory.set(component.url, model);
        return component.url;
    }

    public removeComponent(id: string) {
        this.componentSubDirectory.delete(id);
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
