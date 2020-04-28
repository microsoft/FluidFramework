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
import { IComponentOptions } from "./interfaces";

const ComponentToolbarUrlKey = "component-toolbar-url";
export interface ISpacesDataModel extends EventEmitter {
    readonly componentList: Map<string, Layout>;
    addComponent(component: IComponent & IComponentLoadable, type: string, layout: Layout): void;
    getComponent<T extends IComponent & IComponentLoadable>(id: string): Promise<T | undefined>;
    removeComponent(id: string): void;
    setComponentToolbar(id: string, type: string, toolbarComponent: IComponent & IComponentLoadable): void;
    getComponentToolbar(): Promise<IComponent>;
    updateGridItem(id: string, newLayout: Layout): void;
    getLayout(id: string): Layout;
    saveLayout(): void;
    setTemplate(): Promise<void>;
    readonly componentToolbarUrl: string;
    IComponentCollection: IComponentCollection;
    createCollectionItem<ISpacesCollectionOptions>(options: ISpacesCollectionOptions): IComponent;
    removeCollectionItem(item: IComponent): void;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter implements ISpacesDataModel, IComponentCollection {
    private readonly componentSubDirectory: IDirectory;

    constructor(
        private readonly root: ISharedDirectory,
        private readonly createAndAttachComponent: <T extends IComponent & IComponentLoadable>(
            pkg: string,
            props?: any) => Promise<T>,
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

    public setComponentToolbar(
        url: string,
        type: string,
        toolbarComponent: IComponent & IComponentLoadable): void {
        this.removeComponent(this.componentToolbarUrl);
        this.addComponent(toolbarComponent, type, { x: 0, y: 0, w: 6, h: 2 });
        this.root.set(ComponentToolbarUrlKey, url);
    }

    public async getComponentToolbar(): Promise<IComponent> {
        const component = await this.getComponent(this.componentToolbarUrl);
        return component as IComponent;
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

    public getLayout(id: string): Layout {
        const entry = this.componentSubDirectory.get<ISpacesModel>(id);
        return entry.layout;
    }

    public saveLayout(): void {
        const value = this.componentSubDirectory.values();
        localStorage.setItem("spacesTemplate", JSON.stringify([...value]));
    }

    public async setTemplate(): Promise<void> {
        const size = this.componentSubDirectory.size;
        if (size > 0) {
            console.log("Can't set template because there is already components");
            return;
        }

        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const templateItems = JSON.parse(templateString) as ISpacesModel[];
            const promises = templateItems.map(async (templateItem) => {
                const component = await this.createAndAttachComponent(templateItem.type);
                this.addComponent(component, templateItem.type, templateItem.layout);
                return component;
            });

            await Promise.all(promises);
        }
    }
}

interface ISpacesModel {
    type: string;
    layout: Layout;
    handle: IComponentHandle;
}
