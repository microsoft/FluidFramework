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
import { AsSerializable } from "@fluidframework/component-runtime-definitions";
import { v4 as uuid } from "uuid";

/**
 * ISpacesStorage describes the public API surface of SpacesStorage.
 */
export interface ISpacesStorage<T> extends EventEmitter {
    /**
     * The list of items being stored.
     */
    readonly itemList: Map<string, ISpacesStoredItem<AsSerializable<T>>>;
    /**
     * Adds a item to the storage using the given data.
     * @param serializableItemData - The data of the item to add.
     * @returns A unique key corresponding to the added item.
     */
    addItem(serializableItemData: AsSerializable<T>, layout?: Layout): string
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
 * Spaces collects serializable formats of items and stores them with grid-based layout information.
 */
export interface ISpacesStoredItem<T> {
    serializableItemData: AsSerializable<T>;
    layout: Layout;
}

/**
 * SpacesStorage is a component which maintains a collection of items and a grid-based layout for rendering.
 * The type of the item stored is flexible, as long as it is serializable.
 */
export class SpacesStorage<T> extends PrimedComponent implements ISpacesStorage<T> {
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

    public get itemList(): Map<string, ISpacesStoredItem<AsSerializable<T>>> {
        return this.root;
    }

    public addItem(serializableItemData: AsSerializable<T>, layout?: Layout): string {
        const model: ISpacesStoredItem<T> = {
            serializableItemData,
            layout: layout ?? { x: 0, y: 0, w: 6, h: 2 },
        };

        const id = uuid();
        this.root.set(id, model);
        return id;
    }

    public removeItem(key: string): void {
        this.root.delete(key);
    }

    public updateLayout(key: string, newLayout: Layout): void {
        const currentEntry = this.root.get<ISpacesStoredItem<T>>(key);
        const model = {
            serializableItemData: currentEntry.serializableItemData,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.root.set(key, model);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", () => {
            this.emit("itemListChanged", new Map(this.itemList.entries()));
        });
    }
}
