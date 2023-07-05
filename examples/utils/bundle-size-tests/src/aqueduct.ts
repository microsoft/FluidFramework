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

export function apisToBundle() {
	class BundleTestDo extends DataObject {}
	const doFactory = new DataObjectFactory(
		"BundleTestDo",
		BundleTestDo,
		[new SharedStringFactory(), new DirectoryFactory()],
		{},
	);

	new ContainerRuntimeFactoryWithDefaultDataStore(doFactory, [
		["BundleTestDo", Promise.resolve(doFactory)],
	]);
}
