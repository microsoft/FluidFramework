/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeveeClient } from "@tylerbu/levee-client";
import { TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

import { generateTable } from "./data.js";
import { Table } from "./tree/index.js";

const userId = Math.random().toString(36).slice(2);

const client = new LeveeClient({
	connection: {
		httpUrl: "http://localhost:4000",
		tenantKey: "dev-tenant-secret-key",
		user: { id: userId, name: `TestUser-${userId}` },
	},
});

const containerSchema = {
	initialObjects: { tree: SharedTree },
};

const config = new TreeViewConfiguration({ schema: Table });

export async function initFluid(): Promise<{ view: TreeView<typeof Table> }> {
	let container;
	let view: TreeView<typeof Table>;

	if (location.hash) {
		({ container } = await client.getContainer(location.hash.slice(1), containerSchema, "2"));
		const { tree } = container.initialObjects;
		view = tree.viewWith(config);
	} else {
		({ container } = await client.createContainer(containerSchema, "2"));
		const { tree } = container.initialObjects;
		view = tree.viewWith(config);
		view.initialize(generateTable(10000));
		// TODO: Waiting for 'attach()' is a work around for https://dev.azure.com/fluidframework/internal/_workitems/edit/6805
		await container.attach().then((containerId: string) => (location.hash = containerId));
	}

	return { view };
}
