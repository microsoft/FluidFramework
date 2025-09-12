/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/internal";

import type { IDelayLoadChannelFactory } from "./channel-factories/index.js";
import { MultiFormatDataStoreFactory } from "./data-object-factories/index.js";
// MultiFormatModelDescriptor is not exported publicly; re-declare minimal shape needed locally.
interface MultiFormatModelDescriptor<TEntryPoint> {
	sharedObjects?: readonly IChannelFactory[]; // Subset used for demo
	probe(runtime: IFluidDataStoreRuntime): Promise<boolean> | boolean;
	create(runtime: IFluidDataStoreRuntime): Promise<void> | void;
	get(runtime: IFluidDataStoreRuntime): Promise<TEntryPoint> | TEntryPoint;
}
// eslint-disable-next-line import/no-internal-modules
import { rootDirectoryDescriptor } from "./data-objects/dataObject.js";
// eslint-disable-next-line import/no-internal-modules
import { treeChannelId } from "./data-objects/treeDataObject.js";

//* NOTE: For illustration purposes.  This will need to be properly created in the app
declare const treeDelayLoadFactory: IDelayLoadChannelFactory<ITree>;

const schemaIdentifier = "edc30555-e3ce-4214-b65b-ec69830e506e";
const sf = new SchemaFactory(`${schemaIdentifier}.MigrationDemo`);

class DemoSchema extends sf.object("DemoSchema", {
	arbitraryKeys: sf.map([sf.string, sf.boolean]),
}) {}

const demoTreeConfiguration = new TreeViewConfiguration({
	// root node schema
	schema: DemoSchema,
});

// (Taken from the prototype in the other app repo)
interface ViewWithDirOrTree {
	readonly getArbitraryKey: (key: string) => string | boolean | undefined;
	readonly setArbitraryKey: (key: string, value: string | boolean) => void;
	readonly deleteArbitraryKey: (key: string) => void;
	readonly getRoot: () =>
		| {
				isDirectory: true;
				root: ISharedDirectory;
		  }
		| {
				isDirectory: false;
				root: ITree;
		  };
}

interface TreeModel extends ViewWithDirOrTree {
	readonly getRoot: () => {
		isDirectory: false;
		root: ITree;
	};
}

interface DirModel extends ViewWithDirOrTree {
	readonly getRoot: () => {
		isDirectory: true;
		root: ISharedDirectory;
	};
}

const wrapTreeView = <T>(
	tree: ITree,
	func: (treeView: TreeView<typeof DemoSchema>) => T,
): T => {
	const treeView = tree.viewWith(demoTreeConfiguration);
	// Initialize the root of the tree if it is not already initialized.
	if (treeView.compatibility.canInitialize) {
		treeView.initialize(new DemoSchema({ arbitraryKeys: [] }));
	}
	const value = func(treeView);
	treeView.dispose();
	return value;
};

function makeDirModel(root: ISharedDirectory): DirModel {
	return {
		getRoot: () => ({ isDirectory: true, root }),
		getArbitraryKey: (key) => root.get(key),
		setArbitraryKey: (key, value) => root.set(key, value),
		deleteArbitraryKey: (key) => root.delete(key),
	};
}

function makeTreeModel(tree: ITree): TreeModel {
	return {
		getRoot: () => ({ isDirectory: false, root: tree }),
		getArbitraryKey: (key) => {
			return wrapTreeView(tree, (treeView) => {
				return treeView.root.arbitraryKeys.get(key);
			});
		},
		setArbitraryKey: (key, value) => {
			return wrapTreeView(tree, (treeView) => {
				treeView.root.arbitraryKeys.set(key, value);
			});
		},
		deleteArbitraryKey: (key) => {
			wrapTreeView(tree, (treeView) => {
				treeView.root.arbitraryKeys.delete(key);
			});
		},
	};
}

// Build Multi-Format model descriptors: prefer SharedTree, fall back to SharedDirectory
// NOTE: These descriptors conform to MultiFormatModelDescriptor shape used by MultiFormatDataStoreFactory.
const treeDescriptor: MultiFormatModelDescriptor<TreeModel> = {
	sharedObjects: [treeDelayLoadFactory],
	probe: async (runtime: IFluidDataStoreRuntime) => {
		try {
			const tree = await runtime.getChannel(treeChannelId);
			return SharedTree.is(tree);
		} catch {
			return false;
		}
	},
	create: (runtime: IFluidDataStoreRuntime) => {
		const tree = runtime.createChannel(
			treeChannelId,
			SharedTree.getFactory().type,
		) as unknown as ITree & ISharedObject;
		tree.bindToContext();
	},
	get: async (runtime: IFluidDataStoreRuntime) => {
		const channel = await runtime.getChannel(treeChannelId);
		if (!SharedTree.is(channel)) {
			throw new Error("Expected SharedTree channel when resolving treeDescriptor entry point");
		}
		return makeTreeModel(channel as unknown as ITree);
	},
};

const dirDescriptor: MultiFormatModelDescriptor<DirModel> = {
	sharedObjects: rootDirectoryDescriptor.sharedObjects?.alwaysLoaded,
	probe: async (runtime: IFluidDataStoreRuntime) => {
		const result = await rootDirectoryDescriptor.probe(
			runtime as unknown as IFluidDataStoreRuntime,
		);
		return result !== undefined;
	},
	create: (runtime: IFluidDataStoreRuntime) => {
		rootDirectoryDescriptor.create(runtime as unknown as IFluidDataStoreRuntime);
	},
	get: async (runtime: IFluidDataStoreRuntime) => {
		const result = await rootDirectoryDescriptor.probe(
			runtime as unknown as IFluidDataStoreRuntime,
		);
		if (!result) {
			throw new Error("Directory model probe failed during get()");
		}
		return makeDirModel(result.root);
	},
};

// Union type of possible model views returned by the multi-format entry point
type MultiFormatModel = DirModel | TreeModel;

// Create a multi-format factory
const multiFormatFactory = new MultiFormatDataStoreFactory({
	type: "DirOrTree",
	modelDescriptors: [treeDescriptor, dirDescriptor],
});

/**
 * Create a new detached multi-format data store instance and return its model view (Tree preferred, Directory fallback).
 * Caller must attach a handle referencing the returned model to bind it into the container graph.
 */
export async function demoCreate(
	containerRuntime: IContainerRuntimeBase,
): Promise<MultiFormatModel> {
	const context = containerRuntime.createDetachedDataStore([multiFormatFactory.type]);
	const runtime = await multiFormatFactory.instantiateDataStore(context, false);
	const model = (await runtime.entryPoint.get()) as MultiFormatModel;
	// The types line up with IProvideFluidDataStoreFactory & IFluidDataStoreChannel via factory + runtime
	await context.attachRuntime(
		multiFormatFactory as unknown as Parameters<typeof context.attachRuntime>[0],
		runtime as unknown as Parameters<typeof context.attachRuntime>[1],
	);
	return model;
}

/**
 * Read an arbitrary key from either model variant (directory or tree).
 */
export async function demoGetKey(
	model: MultiFormatModel,
	key: string,
): Promise<string | boolean | undefined> {
	return model.getArbitraryKey(key);
}
