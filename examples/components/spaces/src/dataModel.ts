/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedDirectory, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import {
    IComponent, IComponentLoadable, IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { Layout } from "react-grid-layout";
import { IComponentOptions, IComponentCollector, ISpacesCollectible, SpacesCompatibleToolbar } from "./interfaces";

const ComponentToolbarUrlKey = "component-toolbar-url";

export interface ISpacesDataModel extends EventEmitter {
    readonly componentList: Map<string, Layout>;
    addComponent(component: IComponent & IComponentLoadable, type: string, layout: Layout): void;
    getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined>;
    removeComponent(id: string): void;
    addFormattedComponents(componentModels: ISpacesModel[]): Promise<void>;
    setComponentToolbar(id: string, type: string, toolbarComponent: SpacesCompatibleToolbar): void;
    getComponentToolbar(): Promise<SpacesCompatibleToolbar | undefined>;
    updateGridItem(id: string, newLayout: Layout): void;
    getModels(): ISpacesModel[]
    readonly componentToolbarUrl: string;
    IComponentCollection: IComponentCollection;
    IComponentCollector: IComponentCollector<ISpacesCollectible>;
    createCollectionItem<ISpacesCollectionOptions>(options: ISpacesCollectionOptions): IComponent;
    removeCollectionItem(item: IComponent): void;
    addItem(key: string, item: ISpacesCollectible): void;
    removeItem(key: string): void;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter
    implements ISpacesDataModel, IComponentCollection, IComponentCollector<ISpacesCollectible> {
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

    public get IComponentCollection() { return this; }
    public get IComponentCollector() { return this; }

    public createCollectionItem<T>(rawOptions: T): IComponent {
        const options = rawOptions as IComponentOptions;
        if (!options.type || !options.component) {
            throw new Error("Tried to create a collection item in Spaces with invalid options");
        }
        this.addComponent(options.component, options.type, { x: 0, y: 0, w: 6, h: 2 });
        return options.component;
    }

    public removeCollectionItem(instance: IComponent): void {
        let componentUrl: string;
        if (instance.IComponentLoadable) {
            componentUrl = instance.IComponentLoadable.url;
            this.removeComponent(componentUrl);
        }
    }

    public addItem(key: string, item: ISpacesCollectible) {
    }

    public removeItem(key: string) {
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

    public get componentToolbarUrl(): string {
        return this.root.get<string>(ComponentToolbarUrlKey);
    }

    public async addFormattedComponents(componentModels: ISpacesModel[]): Promise<void> {
        const components = await Promise.all(componentModels.map(async (model) => model.handle.get()));
        components.forEach((component, index) => {
            this.addComponent(component, componentModels[index].type, componentModels[index].layout);
        });
    }

    public setComponentToolbar(
        url: string,
        type: string,
        toolbarComponent: SpacesCompatibleToolbar,
    ): void {
        this.removeComponent(this.componentToolbarUrl);
        this.addComponent(toolbarComponent, type, { x: 0, y: 0, w: 6, h: 2 });
        this.root.set(ComponentToolbarUrlKey, url);
    }

    public async getComponentToolbar(): Promise<SpacesCompatibleToolbar | undefined> {
        const component = await this.getComponent<SpacesCompatibleToolbar>(this.componentToolbarUrl);
        return component;
    }

    public addComponent(component: IComponent & IComponentLoadable, type: string, layout: Layout): void {
        if (component.handle === undefined) {
            throw new Error(`Component must have a handle: ${type}`);
        }
        const model: ISpacesModel = {
            type,
            layout,
            handle: component.handle,
        };
        this.componentSubDirectory.set(component.url, model);
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

    public async getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined> {
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
