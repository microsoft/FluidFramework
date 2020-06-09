/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Layout } from "react-grid-layout";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";

/**
 * ISpacesStorage describes the public API surface of SpacesStorage.
 */
export interface ISpacesStorage extends EventEmitter {
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
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesStoredComponent {
    handle: IComponentHandle;
    type: string;
    layout: Layout;
}

/**
 * SpacesStorage is a component which maintains a collection of other components and a grid-based layout for rendering.
 */
export class SpacesStorage extends PrimedComponent implements ISpacesStorage {
    public static get ComponentName() { return "@fluid-example/spaces-storage"; }

    private static readonly factory = new PrimedComponentFactory(
        SpacesStorage.ComponentName,
        SpacesStorage,
        [],
        {},
        [],
    );

    public static getFactory() {
        return SpacesStorage.factory;
    }

    public get componentList(): Map<string, ISpacesStoredComponent> {
        return this.root;
    }

    public addItem(handle: IComponentHandle, type: string, layout?: Layout): string {
        const model: ISpacesStoredComponent = {
            handle,
            type,
            layout: layout ?? { x: 0, y: 0, w: 6, h: 2 },
        };

        this.root.set(handle.path, model);
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

    protected async componentHasInitialized() {
        this.root.on("valueChanged", () => {
            this.emit("componentListChanged", new Map(this.componentList.entries()));
        });
    }
}
