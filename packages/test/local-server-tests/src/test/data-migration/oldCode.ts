/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { BuildNode, TraitLabel } from "@fluid-experimental/tree";
import { SharedTree as LegacySharedTree, Change, StablePlace } from "@fluid-experimental/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedDirectory, type IDirectory } from "@fluidframework/map/internal";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/test-utils/internal";

import { runtimeOptions } from "./utils.js";

/**
 * This file contains an example component architecture that has 3 data objects: the RootDO, the DOWithLST, and the DOWithLSTAndDir.
 *
 * The RootDO has the two children Data Objects, the DOWithLST and the DOWithLSTAndDir and a handle to DOWithLST's child LST DDS.
 * The DOWithLST has a DDS the LegacySharedTree.
 * The DOWithLSTAndDir has a DDS the LegacySharedTree and a DDS the SharedDirectory.
 *
 * The basic graph looks like this
 * *        RootDO
 * *       //  |  \\
 * * DOWithLST |  DOWithLSTAndDir
 * *   //      |    //     \\
 * * LST_______|   LST    SharedDirectory
 */

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

// Basic helper functions because the legacy tree is complicated
// The LST is very simple - it is a tree with a single node that has a quantity trait
export function setLSTQuantity(legacyTree: LegacySharedTree, quantity: number) {
	// Initialize the legacy tree with some data
	const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const change: Change = Change.setPayload(nodeId, { quantity });
	legacyTree.applyEdit(change);
}

export function getLSTQuantity(legacyTree: LegacySharedTree): number {
	const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const legacyNode = legacyTree.currentView.getViewNode(nodeId);
	return legacyNode.payload.quantity as number;
}

// This data object has the sole purpose of synchronizing one value, the quantity value.
export class DOWithLST extends DataObject {
	protected async initializingFirstTime(props?: any): Promise<void> {
		const legacyTree = LegacySharedTree.create(this.runtime, "tree");

		const inventoryNode: BuildNode = {
			definition: legacyNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: 0,
				},
			},
		};
		legacyTree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: legacyTree.currentView.root,
					label: "inventory" as TraitLabel,
				}),
			),
		);

		this.root.set("tree", legacyTree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const treeHandle = this.root.get<IFluidHandle<LegacySharedTree>>("tree");
		assert(treeHandle !== undefined, "Tree handle not stored in DOWithLST!");
		const legacyTree = await treeHandle.get();
		this._channel = legacyTree;
	}

	private _channel?: LegacySharedTree;
	public get tree(): LegacySharedTree {
		assert(this._channel !== undefined, "Tree not yet initialized in DOWithLST!");
		return this._channel;
	}
}

// This data object has the purpose of synchronizing two values, the quantity value and the directory value.
export class DOWithLSTAndDir extends DataObject {
	protected async initializingFirstTime(props?: any): Promise<void> {
		const legacyTree = LegacySharedTree.create(this.runtime);

		const inventoryNode: BuildNode = {
			definition: legacyNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: 0,
				},
			},
		};
		legacyTree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: legacyTree.currentView.root,
					label: "inventory" as TraitLabel,
				}),
			),
		);
		const directory = SharedDirectory.create(this.runtime);
		const subDir = directory.createSubDirectory("dir");
		subDir.set("value", "foo");

		this.root.set("tree", legacyTree.handle);
		this.root.set("dir", directory.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const treeHandle = this.root.get<IFluidHandle<LegacySharedTree>>("tree");
		assert(treeHandle !== undefined, "Tree handle not stored in DOWithLSTAndDir!");
		this._tree = await treeHandle.get();

		const dirHandle = this.root.get<IFluidHandle<SharedDirectory>>("dir");
		assert(dirHandle !== undefined, "Directory handle not stored in DOWithLSTAndDir!");
		this._directory = await dirHandle.get();
		this._subDirectory = this._directory.getSubDirectory("dir");
	}

	private _directory?: SharedDirectory;
	private _subDirectory?: IDirectory;
	private _tree?: LegacySharedTree;
	public get tree(): LegacySharedTree {
		assert(this._tree !== undefined, "Tree not yet initialized in DOWithLSTAndDir!");
		return this._tree;
	}
	public get directory(): SharedDirectory {
		assert(this._directory !== undefined, "Directory not yet initialized in DOWithLSTAndDir!");
		return this._directory;
	}
	public get subDirectory(): IDirectory {
		assert(
			this._subDirectory !== undefined,
			"SubDirectory not yet initialized in DOWithLSTAndDir!",
		);
		return this._subDirectory;
	}
}

// This is the root data object that has the two children data objects and a handle to the LST DDS.
// It's purpose is to allow applications to dive deep into the hierarchy of data objects.
export class RootDO extends DataObject {
	private _doWithLST?: DOWithLST;
	public get doWithLST(): DOWithLST {
		assert(this._doWithLST !== undefined, "doWithLST not yet initialized in RootDO!");
		return this._doWithLST;
	}
	private _doWithLSTAndDir?: DOWithLSTAndDir;
	public get doWithLSTAndDir(): DOWithLSTAndDir {
		assert(
			this._doWithLSTAndDir !== undefined,
			"doWithLSTAndDir not yet initialized in RootDO!",
		);
		return this._doWithLSTAndDir;
	}
	private _tree?: LegacySharedTree;
	public get tree(): LegacySharedTree {
		assert(this._tree !== undefined, "sharedTree not yet initialized in RootDO2!");
		return this._tree;
	}

	protected async initializingFirstTime(): Promise<void> {
		const doWithLST = await DOWithLSTFactory.createChildInstance(this.context);
		const doWithLSTAndDir = await DOWithLSTAndDirFactory.createChildInstance(this.context);
		this.root.set("a", doWithLST.handle);
		this.root.set("b", doWithLSTAndDir.handle);
		this.root.set("tree", doWithLST.tree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const doWithLSTHandle = this.root.get<IFluidHandle<DOWithLST>>("a");
		assert(doWithLSTHandle !== undefined, "doWithLST handle not stored in RootDO!");
		this._doWithLST = await doWithLSTHandle.get();

		const doWithLSTAndDirHandle = this.root.get<IFluidHandle<DOWithLSTAndDir>>("b");
		assert(
			doWithLSTAndDirHandle !== undefined,
			"doWithLSTAndDir handle not stored in RootDO!",
		);
		this._doWithLSTAndDir = await doWithLSTAndDirHandle.get();

		const treeHandle = this.root.get<IFluidHandle<LegacySharedTree>>("tree");
		assert(treeHandle !== undefined, "SharedTree handle not stored in RootDO!");
		this._tree = await treeHandle.get();
	}
}

export const DOWithLSTFactory = new DataObjectFactory(
	"a",
	DOWithLST,
	[LegacySharedTree.getFactory()],
	{},
);
export const DOWithLSTAndDirFactory = new DataObjectFactory(
	"b",
	DOWithLSTAndDir,
	[LegacySharedTree.getFactory(), SharedDirectory.getFactory()],
	{},
);
export const RootDOFactory = new DataObjectFactory("rootdo", RootDO, [], {}, [
	DOWithLSTFactory.registryEntry,
	DOWithLSTAndDirFactory.registryEntry,
]);

export const oldRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: RootDOFactory,
	registryEntries: [RootDOFactory.registryEntry],
	runtimeOptions,
});
