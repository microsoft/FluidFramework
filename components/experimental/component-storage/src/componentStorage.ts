/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Layout } from "react-grid-layout";
import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IComponentListened,
    ListenedComponent,
} from "@fluidframework/aqueduct-react";
import {
    IComponentHandle, IComponent, IComponentLoadable,
} from "@fluidframework/component-core-interfaces";
import { IStoredComponent, ComponentMapKey } from "./interfaces";

/**
 * IComponentStorage describes the public API surface of ComponentStorage.
 */
export interface IComponentStorage extends IComponentListened {
    /**
     * The list of components being stored.
     */
    readonly componentList: Map<string, IStoredComponent>;
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
 * ComponentStorage is a component which maintains a collection of other components
 */
export class ComponentStorage extends ListenedComponent implements IComponentStorage {
    public static get ComponentName() { return "@fluid-example/component-storage"; }
    private static readonly factory = new PrimedComponentFactory(
        ComponentStorage.ComponentName,
        ComponentStorage,
        [],
        {},
        [],
    );

    public async createAndAttachComponent<T extends IComponent & IComponentLoadable>(
        pkg: string,
        props?: any): Promise<T> {
        return super.createAndAttachComponent(pkg, props);
    }

    public static getFactory() {
        return ComponentStorage.factory;
    }

    public get componentList(): Map<string, IStoredComponent> {
        return this.root;
    }

    public addItem(handle: IComponentHandle, type: string, layout?: Layout): string {
        const model: IStoredComponent = {
            handle,
            type,
            layout: layout ?? { x: 0, y: 0, w: 6, h: 2 },
        };
        this.root.set(handle.path, model, ComponentMapKey);
        return handle.path;
    }

    public removeItem(key: string): void {
        this.root.delete(key);
    }

    public updateLayout(key: string, newLayout: Layout): void {
        const currentEntry = this.root.get<IStoredComponent>(key);
        const model = {
            handle: currentEntry.handle,
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.root.set(key, model);
    }
}
