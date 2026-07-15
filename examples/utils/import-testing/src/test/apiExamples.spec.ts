/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createEphemeralServiceClient,
	synchronizeLocalService,
	closeEphemeralContainers,
} from "@fluidframework/local-driver/alpha";
import {
	ServiceClient,
	treeDataStoreKind,
	TreeViewConfiguration,
	SchemaFactory,
} from "fluid-framework/alpha";
import { strict as assert } from "node:assert";

// This package is a nice place to put code examples which import from user facing API surfaces like fluid-framework to validate that works end to end.

describe("examples", () => {
	afterEach(async () => {
		await closeEphemeralContainers();
	});

	it("self contained example", async () => {
		// import { createEphemeralServiceClient, synchronizeLocalService } from "@fluidframework/local-driver/alpha";
		// import { ServiceClient, treeDataStoreKind, TreeViewConfiguration, SchemaFactory } from "fluid-framework/alpha";
		// import { strict as assert } from "node:assert";

		// Create a ServiceClient: in this case using an ephemeral in memory service, but could be any Fluid service.
		const service: ServiceClient = createEphemeralServiceClient();
		// Define a DataStoreKind which uses a SharedTree.
		// In this case the schema is for a single number with an initializer that starts the it at 1.
		// This schema is captures in the type allowing for strongly typed access to the data in the tree,
		// where the type matches the schema based runtime enforcement of the schema.
		const numberStore = treeDataStoreKind({
			type: "my-app-root",
			config: new TreeViewConfiguration({ schema: SchemaFactory.number }),
			initializer: () => 1,
		});

		// Create a container in the service with the above DataStoreKind.
		// Ideally this creation would use a service independent API, and only the attach call would be service dependent,
		// but that is not supported yet.
		const detachedContainer1 = await service.createContainer(numberStore);
		const container1 = await detachedContainer1.attach();

		// We now have easy and type safe access to the data in the tree, which will be synced over the service.
		assert.equal(container1.data.root, 1);

		// A second client can load the same container from the service, and will see the same data.
		const container2 = await service.loadContainer(container1.id, numberStore);
		assert.equal(container2.data.root, 1);

		// Both clients can modify the data, and the changes will be synced over the service.
		container2.data.root = 2;
		// Since we are using an ephemeral service, we can await the synchronization using synchronizeLocalService.
		await synchronizeLocalService();

		// And now the changes are visible for all clients.
		assert.equal(container1.data.root, 2);
		assert.equal(container2.data.root, 2);
	});
});
