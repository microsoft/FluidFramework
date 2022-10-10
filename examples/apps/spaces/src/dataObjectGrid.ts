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

/**
 * ISpacesItem stores an itemType and a serializable object pairing.  Spaces maps this typename to its itemMap,
 * which lets it find how to get an item out of the serializable object.  The serializable object likely includes
 * one or more handles to persisted model components, though could include anything it wants.  So the Spaces component
 * owns the typenames, but the individual types own their own serializable object format.
 */
export interface IDataObjectGridItem {
    /**
     * The unknown blob of data that backs the instance of the item.  Probably contains handles, etc.
     */
    serializableObject: Serializable;
    /**
     * A key matching an entry in the spacesItemMap, which we'll use to pair the unknown blob with an entry that
     * knows how to deal with it.
     */
    itemType: string;
}

export interface IDataObjectGrid extends EventEmitter {
    readonly getItems: () => IDataObjectGridStoredItem<IDataObjectGridItem>[];
    readonly getItem: (id: string) => IDataObjectGridStoredItem<IDataObjectGridItem> | undefined;
    readonly addItem: (type: string) => Promise<void>;
    readonly removeItem: (id: string) => void;
    readonly updateLayout: (id: string, newLayout: Layout) => void;
    readonly getViewForItem: (item: IDataObjectGridItem) => Promise<JSX.Element>;
}

/**
 * Spaces collects serializable formats of items and stores them with grid-based layout information.
 */
export interface IDataObjectGridStoredItem<T> {
    id: string;
    serializableItemData: Serializable<T>;
    layout: Layout;
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

    public readonly getItems = (): IDataObjectGridStoredItem<IDataObjectGridItem>[] => {
        return [...this.root.values()] as IDataObjectGridStoredItem<IDataObjectGridItem>[];
    };

    public readonly getItem = (id: string): IDataObjectGridStoredItem<IDataObjectGridItem> | undefined => {
        return this.root.get(id);
    };

    public readonly addItem = async (type: string) => {
        const itemMapEntry = spacesItemMap.get(type);
        if (itemMapEntry === undefined) {
            throw new Error("Unknown item, can't add");
        }

        const serializableObject = await itemMapEntry.create(this.context);
        const id = uuid();
        this.root.set(
            id,
            {
                id,
                serializableItemData: {
                    serializableObject,
                    itemType: type,
                },
                layout: { x: 0, y: 0, w: 6, h: 2 },
            },
        );
    };

    public readonly removeItem = (id: string) => {
        this.root.delete(id);
    };

    public readonly updateLayout = (id: string, newLayout: Layout): void => {
        const currentEntry = this.root.get<IDataObjectGridStoredItem<IDataObjectGridItem>>(id);
        if (currentEntry === undefined) {
            throw new Error("Couldn't find requested item");
        }
        const model = {
            serializableItemData: currentEntry.serializableItemData,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.root.set(id, model);
    };

    public readonly getViewForItem = async (item: IDataObjectGridItem) => {
        const registryEntry = spacesItemMap.get(item.itemType);

        if (registryEntry === undefined) {
            // Probably would be ok to return undefined instead
            throw new Error("Cannot get view, unknown widget type");
        }

        return registryEntry.getView(item.serializableObject);
    };

    protected async hasInitialized() {
        this.root.on("valueChanged", () => {
            this.emit("itemListChanged", this.getItems());
        });
    }
}
