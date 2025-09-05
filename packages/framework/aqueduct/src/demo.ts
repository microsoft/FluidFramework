/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
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
import {
	MigrationDataObjectFactory,
	type MigrationDataObjectFactoryProps,
} from "./data-object-factories/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rootDirectoryDescriptor } from "./data-objects/dataObject.js";
import { MigrationDataObject, type ModelDescriptor } from "./data-objects/index.js";
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

// Build the model descriptors: target is SharedTree first, then SharedDirectory as the existing model
const treeDesc: ModelDescriptor<TreeModel> = {
	sharedObjects: {
		// Tree is provided via a delay-load factory
		delayLoaded: [treeDelayLoadFactory],
	},
	probe: async (runtime) => {
		const tree = await runtime.getChannel(treeChannelId);
		if (!SharedTree.is(tree)) {
			return undefined;
		}
		return makeTreeModel(tree);
	},
	ensureFactoriesLoaded: async () => {
		await treeDelayLoadFactory.loadObjectKindAsync();
	},
	create: (runtime) => {
		const tree = runtime.createChannel(
			treeChannelId,
			SharedTree.getFactory().type,
		) as unknown as ITree & ISharedObject; //* Bummer casting here. The factory knows what it returns (although that doesn't help with ISharedObject)
		tree.bindToContext();
		return makeTreeModel(tree);
	},
};

// For fun, try converting the basic directory model into this one with the more interesting view
const dirDesc: ModelDescriptor<DirModel> = {
	...rootDirectoryDescriptor,
	probe: async (runtime) => {
		const result = await rootDirectoryDescriptor.probe(runtime);
		return result && makeDirModel(result.root);
	},
	create: (runtime) => {
		return makeDirModel(rootDirectoryDescriptor.create(runtime).root);
	},
	is: undefined, //* Whatever
};

// Example migration props
interface MigrationData {
	entries: [string, unknown][];
}

/**
 * DataObject that can migrate from a SharedDirectory-based model to a SharedTree-based model.
 *
 * @remarks
 * Access the data via dirToTreeDataObject.dataModel?.view
 */
class DirToTreeDataObject extends MigrationDataObject<ViewWithDirOrTree> {
	// Single source of truth for descriptors: static on the DataObject class
	public static modelDescriptors = [treeDesc, dirDesc] as const;
}

const props: MigrationDataObjectFactoryProps<
	ViewWithDirOrTree,
	ViewWithDirOrTree & {
		readonly getRoot: () => {
			isDirectory: false;
			root: ITree;
		};
	},
	DirToTreeDataObject,
	MigrationData
> = {
	type: "DirToTree",
	ctor: DirToTreeDataObject,
	canPerformMigration: async () => true,
	asyncGetDataForMigration: async (existingModel: ViewWithDirOrTree) => {
		// existingModel will be { root: ISharedDirectory } when present
		const existingRoot = existingModel.getRoot();
		if (existingRoot.isDirectory) {
			const dir = existingRoot.root;
			// read some synchronous snapshot data out of the directory handles
			return { entries: [...dir.entries()] };
		}
		// else -- No need to migrate from tree, so don't implement this
		return { entries: [] };
	},
	migrateDataObject: (
		runtime: IFluidDataStoreRuntime,
		newModel: TreeModel,
		data: MigrationData,
	) => {
		// newModel.tree.viewWith... to ingest the data
	},
};

// eslint-disable-next-line jsdoc/require-jsdoc
export const factory = new MigrationDataObjectFactory(props);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataObject = await factory.createInstance({} as any as IContainerRuntimeBase);
dataObject.dataModel?.view.getArbitraryKey("exampleKey");
