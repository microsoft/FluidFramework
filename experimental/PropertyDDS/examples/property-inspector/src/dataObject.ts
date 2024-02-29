/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-example/example-utils";
import { BaseProperty } from "@fluid-experimental/property-properties";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDirectory, IValueChanged } from "@fluidframework/map";
import { SharedPropertyTree, PropertyTreeFactory } from "@fluid-experimental/property-dds";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";

export interface IPropertyTree extends EventEmitter {
	pset: any;
	tree: SharedPropertyTree;

	on(event: "changeSetModified" | "commit", listener: (CS: any) => void): this;

	stopTransmission(stopped: boolean): void;

	commit(): void;
}

// The root is map-like, so we'll use this key for storing the value.
const propertyKey = "propertyKey";

const directoryWait = async <T = any>(directory: IDirectory, key: string): Promise<T> => {
	const maybeValue = directory.get<T>(key);
	if (maybeValue !== undefined) {
		return maybeValue;
	}

	return new Promise((resolve) => {
		const handler = (changed: IValueChanged) => {
			if (changed.key === key) {
				directory.off("containedValueChanged", handler);
				const value = directory.get<T>(changed.key);
				if (value === undefined) {
					throw new Error("Unexpected containedValueChanged result");
				}
				resolve(value);
			}
		};
		directory.on("containedValueChanged", handler);
	});
};

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class PropertyTree extends DataObject implements IPropertyTree {
	private _tree?: SharedPropertyTree;

	stopTransmission(stopped: boolean): void {
		this._tree?.stopTransmission(stopped);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for dice rolls.
	 */
	protected async initialize(existing: boolean) {
		if (existing) {
			// The SharedPropertyTree isn't created until after attach, so we potentially need to wait for it.
			const treeHandle = await directoryWait<IFluidHandle<SharedPropertyTree>>(
				this.root,
				propertyKey,
			);
			this._tree = await treeHandle.get();
		} else {
			if (this._tree === undefined) {
				this.root.set(propertyKey, SharedPropertyTree.create(this.runtime).handle);
				this._tree = await this.root
					.get<IFluidHandle<SharedPropertyTree>>(propertyKey)
					?.get();
			}
		}

		this.tree.on("localModification", (changeSet: any) => {
			this.emit("changeSetModified", changeSet);
		});
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		return this.initialize(false);
	}

	protected async initializingFromExisting(): Promise<void> {
		return this.initialize(true);
	}

	public get tree() {
		return this._tree!;
	}

	public get pset() {
		return this.tree.root;
	}

	commit() {
		this.tree.commit();
		this.emit("commit");
	}

	resolvePath(path: string, options: any): BaseProperty | undefined {
		return this.tree.root.resolvePath(path, options);
	}

	public static async create(parentContext: IFluidDataStoreContext, props?: any) {
		// return PropertyTreeRoot.factory.create(parentContext, props);
		throw new Error("Not yet implemented");
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const PropertyTreeInstantiationFactory = new DataObjectFactory<PropertyTree>(
	"property-tree",
	PropertyTree,
	[new PropertyTreeFactory()],
	{},
);
