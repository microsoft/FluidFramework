/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha, TreeViewConfiguration } from "../simple-tree/index.js";

import { treeDataStoreKind } from "../treeDataStore.js";
import { createEphemeralServiceClient } from "@fluidframework/local-driver/internal";
import { createContainer } from "@fluidframework/runtime-definitions/internal";

describe("treeDataStore", () => {
	it("example use", async () => {
		const myFactory = treeDataStoreKind({
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const service = createEphemeralServiceClient();

		const container1 = await service.attachContainer(createContainer(myFactory));

		assert.equal(container1.root.root, 1);

		const container2 = await service.loadContainer(container1.id, myFactory);

		assert.equal(container2.root.root, 1);

		container2.root.root = 2;
		assert.equal(container1.root.root, 2);
		assert.equal(container2.root.root, 1);
	});
});
