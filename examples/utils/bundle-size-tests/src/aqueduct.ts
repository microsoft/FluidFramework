/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { DirectoryFactory } from "@fluidframework/map";
import { SharedStringFactory } from "@fluidframework/sequence";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

export function apisToBundle() {
	class BundleTestDo extends DataObject {}
	const defaultFactory = new DataObjectFactory(
		"BundleTestDo",
		BundleTestDo,
		[new SharedStringFactory(), new DirectoryFactory()],
		{},
	);

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
