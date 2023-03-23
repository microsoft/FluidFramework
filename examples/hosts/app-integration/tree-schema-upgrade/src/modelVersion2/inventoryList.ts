/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import {
	brand,
	defaultSchemaPolicy,
	FieldKinds,
	fieldSchema,
	FieldSchema,
	ISharedTree,
	jsonableTreeFromCursor,
	mapCursorField,
	moveToDetachedField,
	namedTreeSchema,
	rootFieldKey,
	runSynchronous,
	SchemaDataAndPolicy,
	SharedTreeFactory,
	singleTextCursor,
	TreeSchema,
	TreeSchemaIdentifier,
	ValueSchema,
} from "@fluid-internal/tree";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IInventoryItem, IInventoryList } from "../modelInterfaces";

const omniSequence: FieldSchema = fieldSchema(FieldKinds.sequence);

const omniNode: TreeSchema = namedTreeSchema({
	name: brand("foo"),
	extraLocalFields: omniSequence,
	value: ValueSchema.Serializable,
});

const schemaTypes: TreeSchemaIdentifier[] = [brand("foo")];

export const appSchemaData: SchemaDataAndPolicy = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map([[rootFieldKey, omniSequence]]),
	treeSchema: new Map(schemaTypes.map((name) => [name, omniNode])),
};

const treeKey = "sharedTree-key";

const quantityKey = "quantity";

class InventoryItem extends EventEmitter implements IInventoryItem {
	public get id() {
		return this._id;
	}
	// Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
	public get name() {
		return this._name;
	}
	public get quantity() {
		const mapValue = this._quantity.get<number>(quantityKey);
		if (mapValue === undefined) {
			throw new Error("Expected a valid quantity");
		}
		return mapValue;
	}
	public set quantity(newValue: number) {
		this._quantity.set(quantityKey, newValue);
	}
	public constructor(
		private readonly _id: string,
		private readonly _name: SharedString,
		private readonly _quantity: SharedMap,
	) {
		super();
		this._quantity.on("valueChanged", () => {
			this.emit("quantityChanged");
		});
	}
}

// type InventoryItemData = { name: IFluidHandle<SharedString>, quantity: IFluidHandle<SharedMap> };

/**
 * The InventoryList is our data object that implements the IInventoryList interface.
 */
export class InventoryList extends DataObject implements IInventoryList {
	private readonly inventoryItems = new Map<string, InventoryItem>();
	static treeFactory = new SharedTreeFactory();
	public tree: ISharedTree | undefined;
	public nodeIds: string[] = [];

	public readonly getTreeView = () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const readCursor = this.tree!.forest.allocateCursor();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		moveToDetachedField(this.tree!.forest, readCursor);
		const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
		readCursor.free();
		return JSON.stringify(actual);
	};

	public readonly addItem = (name: string, quantity: number) => {
		this.tree?.storedSchema.update(appSchemaData);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const cursor = this.tree!.forest.allocateCursor();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		moveToDetachedField(this.tree!.forest, cursor);
		cursor.firstNode();
		cursor.firstField();
		cursor.firstNode();
		const path = cursor.getPath();
		cursor.free();

		let value = Math.floor(Math.random() * 1000000).toString();
		while (this.nodeIds?.includes(value)) {
			value = Math.floor(Math.random() * 1000000).toString();
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		runSynchronous(this.tree!, () => {
			const writeCursors = singleTextCursor({ type: brand("Node"), value });
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const field = this.tree!.editor.sequenceField(path?.parent, path!.parentField);
			field.insert(0, writeCursors);
		});
		const id = uuid();
		this.root.set(id, 1);
	};

	public readonly getItems = () => {
		return [...this.inventoryItems.values()];
	};

	public readonly getItem = (id: string) => {
		return this.inventoryItems.get(id);
	};

	private readonly handleItemAdded = async (id: string) => {
		this.emit("itemAdded");
	};

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		const treeHandle = this.root.get<IFluidHandle<ISharedTree>>(treeKey);
		if (treeHandle === undefined) {
			throw new Error("SharedTree missing");
		}
		this.tree = await treeHandle.get();
		this.root.on("valueChanged", (changed) => {
			if (changed.previousValue === undefined) {
				// Must be from adding a new item
				this.handleItemAdded(changed.key).catch((error) => {
					console.error(error);
				});
			} else {
				// Since all data modifications happen within the SharedString or SharedMap, the root directory
				// should never see anything except adds and deletes.
				console.error("Unexpected modification to inventory list");
			}
		});
	}
	protected async initializingFirstTime() {
		const tree: ISharedTree = this.runtime.createChannel(
			"schema-migration-sharedTree",
			InventoryList.treeFactory.type,
		) as ISharedTree;
		this.root.set(treeKey, tree.handle);
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListInstantiationFactory = new DataObjectFactory<InventoryList>(
	"inventory-list",
	InventoryList,
	[SharedMap.getFactory(), SharedString.getFactory(), new SharedTreeFactory()],
	{},
);
