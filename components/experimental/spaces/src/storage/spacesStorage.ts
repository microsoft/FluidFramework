/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Layout } from "react-grid-layout";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { SharedDirectory, ISharedDirectory } from "@microsoft/fluid-map";
import {
    IComponentHandle, IComponent, IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { ISpacesStoredComponent, ComponentMapKey } from "../interfaces";

/**
 * ISpacesStorage describes the public API surface of SpacesStorage.
 */
export interface ISpacesStorage {
    /**
     * The list of components being stored.
     */
    readonly componentList: Map<string, ISpacesStoredComponent>;
    /**
     * Adds the given item to the collector.
     * @param item - The item to add.
     * @returns A unique key corresponding to the added item.
     */
    addItem(handle: IComponentHandle, type: string, layout?: Layout): string
    /**
     * Removes the item specified by the given key.
     * @param key - The key referring to the item to remove.
     */
    removeItem(key: string): void;
    /**
     * Update the layout of the given item.
     * @param key - The item to update
     * @param newLayout - The item's new layout
     */
    updateLayout(key: string, newLayout: Layout): void;
}

/**
 * SpacesStorage is a component which maintains a collection of other components and a grid-based layout for rendering.
 */
export class SpacesStorage extends PrimedComponent implements ISpacesStorage {
    public static get ComponentName() { return "@fluid-example/spaces-storage"; }
    private _componentDirectory: ISharedDirectory | undefined;
    private static readonly factory = new PrimedComponentFactory(
        SpacesStorage.ComponentName,
        SpacesStorage,
        [],
        {},
        [],
    );

    protected async componentInitializingFirstTime() {
        this._componentDirectory = SharedDirectory.create(this.runtime);
        this.root.set(ComponentMapKey, this._componentDirectory.handle);
    }

    protected async componentInitializingFromExisting() {
        this._componentDirectory = await this.root.get<IComponentHandle<ISharedDirectory>>(ComponentMapKey).get();
    }

    public async createAndAttachComponent<T extends IComponent & IComponentLoadable>(
        pkg: string,
        props?: any): Promise<T> {
        return super.createAndAttachComponent(pkg, props);
    }

    public static getFactory() {
        return SpacesStorage.factory;
    }

    public get componentList(): Map<string, ISpacesStoredComponent> {
        return this._componentDirectory || this.root.get<SharedDirectory>(ComponentMapKey);
    }

    public addItem(handle: IComponentHandle, type: string, layout?: Layout): string {
        const model: ISpacesStoredComponent = {
            handle,
            type,
            layout: layout ?? { x: 0, y: 0, w: 6, h: 2 },
        };
        this._componentDirectory?.set(handle.path, model, ComponentMapKey);
        return handle.path;
    }

    public removeItem(key: string): void {
        this.root.delete(key);
    }

    public updateLayout(key: string, newLayout: Layout): void {
        const currentEntry = this.root.get<ISpacesStoredComponent>(key);
        const model = {
            handle: currentEntry.handle,
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.root.set(key, model);
    }
}
