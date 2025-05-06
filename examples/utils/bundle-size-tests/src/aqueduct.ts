/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { DirectoryFactory } from "@fluidframework/map/internal";
import { SharedString } from "@fluidframework/sequence/internal";

export function apisToBundle() {
	class BundleTestDo extends DataObject {}
	const defaultFactory = new DataObjectFactory({
		type: "BundleTestDo",
		ctor: BundleTestDo,
		sharedObjects: [SharedString.getFactory(), new DirectoryFactory()],
		optionalProviders: {},
	});

	new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory,
		registryEntries: [["BundleTestDo", Promise.resolve(defaultFactory)]],
		provideEntryPoint: async (runtime: IContainerRuntime) => {
			const dataStoreHandle = await runtime.getAliasedDataStoreEntryPoint("default");
			if (dataStoreHandle === undefined) {
				throw new Error("default dataStore must exist");
			}
			return dataStoreHandle.get();
		},
	});
}
