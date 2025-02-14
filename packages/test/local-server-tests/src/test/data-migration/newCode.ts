/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/test-utils/internal";
import { SchemaFactory } from "@fluidframework/tree";
import {
	ITree,
	SharedTree,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree/internal";

import { runtimeOptions } from "./utils.js";

/**
 * This file contains an example component architecture that has 3 migrated data objects: the RootDO, the DOWithST, and the DOWithST2.
 *
 * The RootDO has the two children Data Objects, the DOWithST and the DOWithST2 and a handle to DOWithST's child SharedTree DDS.
 * The DOWithST is the migrated DOWithLST and has the DDS the new SharedTree.
 * The DOWithLST2 is the migrated DOWithLSTAndDir and has a DDS the new SharedTree.
 *
 * The basic graph looks like this
 * *        RootDO
 * *       //  |  \\
 * *  DOWithST | DOWithST2
 * *     ||    |    ||
 * *     ST____|    ST
 */

const sf = new SchemaFactory("A");
class Schema1 extends sf.object("ST", {
	quantity: sf.number,
}) {}
export const treeConfig1 = new TreeViewConfiguration({
	schema: Schema1,
});

class DirectorySchema extends sf.object("Dir", {
	value: sf.string,
}) {}
class Schema2 extends sf.object("ST", {
	quantity: sf.number,
	dir: DirectorySchema,
}) {}
export const treeConfig2 = new TreeViewConfiguration({
	schema: Schema2,
});

export class DOWithST extends DataObject {
	public get _root(): ISharedDirectory {
		return this.root;
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		const newTree: ITree = SharedTree.create(this.runtime, "tree");
		const view = newTree.viewWith(treeConfig1);
		view.initialize({
			quantity: 0,
		});
		view.dispose();
		this.root.set("tree", newTree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const treeHandle = this.root.get<IFluidHandle<ITree>>("tree");
		assert(treeHandle !== undefined, "Tree handle not stored in DOWithST!");
		const newTree = await treeHandle.get();
		this._view = newTree.viewWith(treeConfig1);
		this._tree = newTree;
	}

	private _tree?: ITree;
	public get tree(): ITree {
		assert(this._tree !== undefined, "Tree not yet initialized in DOWithST!");
		return this._tree;
	}
	private _view?: TreeView<typeof Schema1>;
	public get view(): TreeView<typeof Schema1> {
		assert(this._view !== undefined, "View not yet initialized in DOWithST!");
		return this._view;
	}
}

export class DOWithST2 extends DataObject {
	public get _root(): ISharedDirectory {
		return this.root;
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		const newTree: ITree = SharedTree.create(this.runtime, "tree");
		const view = newTree.viewWith(treeConfig2);
		view.initialize({
			quantity: 0,
			dir: {
				value: "foo",
			},
		});
		view.dispose();
		this.root.set("tree", newTree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const treeHandle = this.root.get<IFluidHandle<ITree>>("tree");
		assert(treeHandle !== undefined, "Tree handle not stored in DOWithST!");
		const newTree = await treeHandle.get();
		this._view = newTree.viewWith(treeConfig2);
	}

	private _view?: TreeView<typeof Schema2>;
	public get view(): TreeView<typeof Schema2> {
		assert(this._view !== undefined, "View not yet initialized in DOWithST!");
		return this._view;
	}
}

export class RootDO2 extends DataObject {
	public get _root(): ISharedDirectory {
		return this.root;
	}

	private _doWithST?: DOWithST;
	public get doWithST(): DOWithST {
		assert(this._doWithST !== undefined, "doWithST not yet initialized in RootDO2!");
		return this._doWithST;
	}
	private _doWithST2?: DOWithST2;
	public get doWithST2(): DOWithST2 {
		assert(this._doWithST2 !== undefined, "doWithST2 not yet initialized in RootDO2!");
		return this._doWithST2;
	}
	private _tree?: ITree;
	public get tree(): ITree {
		assert(this._tree !== undefined, "sharedTree not yet initialized in RootDO2!");
		return this._tree;
	}

	protected async initializingFirstTime(): Promise<void> {
		const doWithLST = await DOWithSTFactory.createChildInstance(this.context);
		const doWithLSTAndDir = await DOWithST2Factory.createChildInstance(this.context);
		this.root.set("a", doWithLST.handle);
		this.root.set("b", doWithLSTAndDir.handle);
		this.root.set("tree", doWithLST.tree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const handle = this.root.get<IFluidHandle<DOWithST>>("a");
		assert(handle !== undefined, "doWithST handle not stored in RootDO2!");
		this._doWithST = await handle.get();

		const handle2 = this.root.get<IFluidHandle<DOWithST2>>("b");
		assert(handle2 !== undefined, "doWithST2 handle not stored in RootDO2!");
		this._doWithST2 = await handle2.get();

		const treeHandle = this.root.get<IFluidHandle<ITree>>("tree");
		assert(treeHandle !== undefined, "SharedTree handle not stored in RootDO2!");
		this._tree = await treeHandle.get();
	}
}

export const DOWithSTFactory = new DataObjectFactory(
	"a",
	DOWithST,
	[SharedTree.getFactory()],
	{},
);
export const DOWithST2Factory = new DataObjectFactory(
	"b",
	DOWithST2,
	[SharedTree.getFactory()],
	{},
);
export const RootDO2Factory = new DataObjectFactory("rootdo", RootDO2, [], {}, [
	DOWithSTFactory.registryEntry,
	DOWithST2Factory.registryEntry,
]);

export const newRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: RootDO2Factory,
	registryEntries: [RootDO2Factory.registryEntry],
	runtimeOptions,
});
