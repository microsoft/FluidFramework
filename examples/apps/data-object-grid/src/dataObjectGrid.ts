/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { Serializable } from "@fluidframework/datastore-definitions/legacy";
import type React from "react";
import { Layout } from "react-grid-layout";
import { v4 as uuid } from "uuid";

import {
	dataObjectRegistry,
	registryEntries,
	type ISingleHandleItem,
} from "./dataObjectRegistry.js";

/**
 * Interface for the data object grid data object.
 *
 * Generally acts like a collection (get/add/remove) but additionally permits modifying the associated layout
 * for a given member of the collection as well as retrieving an appropriate view for a given item.
 */
export interface IDataObjectGrid<T = unknown> extends EventEmitter {
	/**
	 * Retrieve all stored items in the grid.
	 */
	readonly getItems: () => IDataObjectGridItem<T>[];
	/**
	 * Retrive a specific stored item in the grid.
	 */
	readonly getItem: (id: string) => IDataObjectGridItem<T> | undefined;
	/**
	 * Add an item of the given type to the grid.
	 */
	readonly addItem: (type: string) => Promise<string>;
	/**
	 * Remove the specified item from the grid.
	 */
	readonly removeItem: (id: string) => void;
	/**
	 * Change the layout of the specified item.
	 */
	readonly updateLayout: (id: string, newLayout: Layout) => void;
	/**
	 * Get a React element view of the specified item.
	 */
	readonly getViewForItem: (item: IDataObjectGridItem<T>) => Promise<JSX.Element>;
}

/**
 * The serializable format of items that DataObjectGrid can store along with grid-based layout information.
 */
export interface IDataObjectGridItem<T = unknown> {
	/**
	 * A unique id for the item.
	 */
	readonly id: string;
	/**
	 * A key matching an entry in the dataObjectRegistry, which we'll use to pair the unknown blob with an entry that
	 * knows how to deal with it.
	 */
	readonly type: string;
	/**
	 * The unknown blob of data that backs the instance of the item.  Probably contains handles, etc.
	 */
	readonly serializableData: Serializable<T>;
	/**
	 * The react grid layout of the item.
	 */
	readonly layout: Layout;
}

/**
 * DataObjectGrid manages multiple subcomponents and their layouts.
 */
export class DataObjectGrid extends DataObject implements IDataObjectGrid<ISingleHandleItem> {
	public static readonly ComponentName = "@fluid-example/data-object-grid";

	private static readonly factory = new DataObjectFactory({
		type: DataObjectGrid.ComponentName,
		ctor: DataObjectGrid,
		registryEntries: [...registryEntries],
	});

	public static getFactory(): DataObjectFactory<DataObjectGrid> {
		return DataObjectGrid.factory;
	}

	public readonly getItems = (): IDataObjectGridItem<ISingleHandleItem>[] => {
		return [...this.root.values()] as IDataObjectGridItem<ISingleHandleItem>[];
	};

	public readonly getItem = (
		id: string,
	): IDataObjectGridItem<ISingleHandleItem> | undefined => {
		return this.root.get(id);
	};

	public readonly addItem = async (type: string): Promise<string> => {
		const itemMapEntry = dataObjectRegistry.get(type);
		if (itemMapEntry === undefined) {
			throw new Error("Unknown item, can't add");
		}

		const serializableData = await itemMapEntry.create(this.context);
		const id = uuid();
		const newItem: IDataObjectGridItem<ISingleHandleItem> = {
			id,
			type,
			serializableData,
			layout: { x: 0, y: 0, w: 6, h: 2, i: id },
		};
		this.root.set(id, newItem);
		return id;
	};

	public readonly removeItem = (id: string): void => {
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
			layout: {
				x: newLayout.x,
				y: newLayout.y,
				w: newLayout.w,
				h: newLayout.h,
				i: currentItem.id,
			},
		};
		this.root.set(id, updatedItem);
	};

	public readonly getViewForItem = async (
		item: IDataObjectGridItem<ISingleHandleItem>,
	): Promise<React.ReactElement> => {
		const registryEntry = dataObjectRegistry.get(item.type);

		if (registryEntry === undefined) {
			// Probably would be ok to return undefined instead
			throw new Error("Cannot get view, unknown widget type");
		}

		return registryEntry.getView(item.serializableData);
	};

	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", () => {
			this.emit("itemListChanged", this.getItems());
		});
	}
}
