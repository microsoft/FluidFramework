/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ISharedDirectory,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map/internal";

import { MigrationDataObject, type ModelDescriptor } from "./migrationDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * ID of the root ISharedDirectory. Every DataObject contains this ISharedDirectory and adds further DDSes underneath it.
 * @internal
 */
export const dataObjectRootDirectoryId = "root";

/**
 * How to access the root Shared Directory maintained by this DataObject.
 * @legacy
 * @beta
 */
export interface RootDirectoryView {
	root: ISharedDirectory; // (property name here doesn't have to match the channel ID "root")
}

/**
 * Model Descriptor for the classic root SharedDirectory model.
 */
export const rootDirectoryDescriptor: ModelDescriptor<RootDirectoryView> = {
	sharedObjects: {
		// SharedDirectory is always loaded on the root id
		alwaysLoaded: [
			SharedDirectory.getFactory(),
			// TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
			SharedMap.getFactory(),
		],
	},
	probe: async (runtime) => {
		// Find the root directory
		const root = (await runtime.getChannel(dataObjectRootDirectoryId)) as ISharedDirectory;

		// This will actually be an ISharedMap if the channel was previously created by the older version of
		// DataObject which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
		// SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
		if (root.attributes.type === MapFactory.Type) {
			runtime.logger.send({
				category: "generic",
				eventName: "MapDataObject",
				message: "Legacy document, SharedMap is masquerading as SharedDirectory in DataObject",
			});
		}
		return { root };
	},
	ensureFactoriesLoaded: async () => {},
	create: (runtime) => {
		const root = SharedDirectory.create(runtime, dataObjectRootDirectoryId);
		root.bindToContext();
		return { root };
	},
	is: (m): m is { root: ISharedDirectory } =>
		!!(m && (m as unknown as Record<string, unknown>).root),
};

/**
 * DataObject is a base data store that is primed with a root directory. It
 * ensures that it is created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * @typeParam I - The optional input types used to strongly type the data object
 * @legacy
 * @beta
 */
export abstract class DataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends MigrationDataObject<RootDirectoryView, I> {
	/**
	 * Access the root directory.
	 *
	 * Throws an error if the root directory is not yet initialized (should be hard to hit)
	 */
	protected get root(): ISharedDirectory {
		const internalRoot = this.dataModel?.view.root;
		if (!internalRoot) {
			throw new Error(this.getUninitializedErrorString(`root`));
		}

		return internalRoot;
	}

	protected async asyncGetDataForMigration(existingModel: RootDirectoryView): Promise<never> {
		throw new Error("DataObject does not support migration");
	}

	protected async canPerformMigration(): Promise<boolean> {
		return false;
	}

	protected migrateDataObject(newModel: RootDirectoryView, data: never): void {
		throw new Error("DataObject does not support migration");
	}

	protected async getModelDescriptors(): Promise<
		readonly [ModelDescriptor<RootDirectoryView>, ...ModelDescriptor<RootDirectoryView>[]]
	> {
		return [rootDirectoryDescriptor];
	}
}
