/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type { IDelayLoadChannelFactory } from "./channel-factories/index.js";
import {
	MigrationDataObjectFactory,
	type MigrationDataObjectFactoryProps,
} from "./data-object-factories/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rootDirectoryDescriptor } from "./data-objects/dataObject.js";
import {
	MigrationDataObject,
	treeChannelId,
	type ModelDescriptor,
} from "./data-objects/index.js";

//* NOTE: For illustration purposes.  This will need to be properly created in the app
declare const treeDelayLoadFactory: IDelayLoadChannelFactory<ITree & ISharedObject>;

// Model shapes
interface TreeModel {
	tree: ITree & ISharedObject;
}
interface DirModel {
	root: ISharedDirectory;
}
//* NOTE: This would include the Arbitrary Keys APIs as well)
type UniversalView = TreeModel | DirModel;

// Build the model descriptors: target is SharedTree first, then SharedDirectory as the existing model
const treeDesc: ModelDescriptor<TreeModel> = sharedTreeDescriptor(treeDelayLoadFactory);
const dirDesc: ModelDescriptor<DirModel> = rootDirectoryDescriptor;

// Example migration props
interface MigrationData {
	entries: [string, unknown][];
}

class DirToTreeDataObject extends MigrationDataObject<UniversalView> {
	protected get modelCandidates(): [
		ModelDescriptor<UniversalView>,
		...ModelDescriptor<UniversalView>[],
	] {
		//* BUG: This is redundant with the same list in the Factory
		//* We need to fix the API so this array is only specified once
		return [treeDesc, dirDesc];
	}
}

const props: MigrationDataObjectFactoryProps<
	UniversalView,
	TreeModel,
	DirToTreeDataObject,
	MigrationData
> = {
	type: "DirToTree",
	ctor: DirToTreeDataObject,
	modelDescriptors: [treeDesc, dirDesc],
	canPerformMigration: async () => true,
	asyncGetDataForMigration: async (existingModel: UniversalView) => {
		// existingModel will be { root: ISharedDirectory } when present
		if ("root" in existingModel) {
			const dir = existingModel.root;
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

/**
 * Convenience descriptor for SharedTree-backed models using the standard tree channel id
 * and a delay-load factory.
 */
export function sharedTreeDescriptor(
	treeFactory: IDelayLoadChannelFactory<ITree & ISharedObject>, //* ISharedObject needed for bindToContext call
): ModelDescriptor<{ tree: ITree & ISharedObject }> {
	return {
		sharedObjects: {
			// Tree is provided via a delay-load factory
			delayLoaded: [treeFactory],
		},
		probe: async (runtime) => {
			try {
				const tree = await runtime.getChannel(treeChannelId);
				if (SharedTree.is(tree)) {
					return { tree: tree as ITree & ISharedObject };
				}
			} catch {
				return undefined;
			}
		},
		ensureFactoriesLoaded: async () => {
			await treeFactory.loadObjectKindAsync();
		},
		create: (runtime) => {
			const tree = treeFactory.create(runtime, treeChannelId);
			tree.bindToContext();
			return { tree };
		},
		is: (m): m is { tree: ITree & ISharedObject } =>
			!!(m && (m as unknown as Record<string, unknown>).tree),
	};
}
