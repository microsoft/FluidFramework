/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { Serializable } from "@fluidframework/datastore-definitions";

import { Layout } from "react-grid-layout";
import { v4 as uuid } from "uuid";

import {
    registryEntries,
    spacesItemMap,
} from "./dataObjectRegistry";

export interface IDataObjectGrid extends EventEmitter {
    readonly getItems: () => IDataObjectGridItem[];
    readonly getItem: (id: string) => IDataObjectGridItem | undefined;
    readonly addItem: (type: string) => Promise<string>;
    readonly removeItem: (id: string) => void;
    readonly updateLayout: (id: string, newLayout: Layout) => void;
    readonly getViewForItem: (item: IDataObjectGridItem) => Promise<JSX.Element>;
}

/**
 * Spaces collects serializable formats of items and stores them with grid-based layout information.
 */
export interface IDataObjectGridItem {
    /**
     * A unique id for the item.
     */
    readonly id: string;
    /**
     * A key matching an entry in the spacesItemMap, which we'll use to pair the unknown blob with an entry that
     * knows how to deal with it.
     */
    readonly type: string;
    /**
     * The unknown blob of data that backs the instance of the item.  Probably contains handles, etc.
     */
    readonly serializableData: Serializable;
    /**
     * The react grid layout of the item.
     */
    readonly layout: Layout;
}

/**
 * Spaces is the main component, which composes a SpacesToolbar with a SpacesStorage.
 */
export class DataObjectGrid extends DataObject implements IDataObjectGrid {
    public static get ComponentName() { return "@fluid-example/spaces"; }

    private static readonly factory = new DataObjectFactory(
        DataObjectGrid.ComponentName,
        DataObjectGrid,
        [],
        {},
        [...registryEntries],
    );

    public static getFactory() {
        return DataObjectGrid.factory;
    }

    public readonly getItems = (): IDataObjectGridItem[] => {
        return [...this.root.values()] as IDataObjectGridItem[];
    };

    public readonly getItem = (id: string): IDataObjectGridItem | undefined => {
        return this.root.get(id);
    };

    public readonly addItem = async (type: string) => {
        const itemMapEntry = spacesItemMap.get(type);
        if (itemMapEntry === undefined) {
            throw new Error("Unknown item, can't add");
        }

        const serializableData = await itemMapEntry.create(this.context);
        const id = uuid();
        const newItem: IDataObjectGridItem = {
            id,
            type,
            serializableData,
            layout: { x: 0, y: 0, w: 6, h: 2 },
        };
        this.root.set(
            id,
            newItem,
        );
        return id;
    };

    public readonly removeItem = (id: string) => {
        this.root.delete(id);
    };

    public readonly updateLayout = (id: string, newLayout: Layout): void => {
        const currentItem = this.root.get<IDataObjectGridItem>(id);
        if (currentItem === undefined) {
            throw new Error("Couldn't find requested item");
        }
        const updatedItem: IDataObjectGridItem = {
            id: currentItem.id,
            type: currentItem.type,
            serializableData: currentItem.serializableData,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.root.set(id, updatedItem);
    };

    public readonly getViewForItem = async (item: IDataObjectGridItem) => {
        const registryEntry = spacesItemMap.get(item.type);

        if (registryEntry === undefined) {
            // Probably would be ok to return undefined instead
            throw new Error("Cannot get view, unknown widget type");
        }

        return registryEntry.getView(item.serializableData);
    };

    protected async hasInitialized() {
        this.root.on("valueChanged", () => {
            this.emit("itemListChanged", this.getItems());
        });
    }
}
