/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { TreeViewConfiguration } from "@fluidframework/tree";
import { asTreeViewAlpha, type TreeViewAlpha } from "@fluidframework/tree/alpha";
import { type ContainerSchema, SharedTree } from "fluid-framework";

import { sampleSprintBoard } from "./sampleData.js";
import { SprintBoard } from "./schema.js";

const containerSchema = {
	initialObjects: {
		tree: SharedTree,
	},
} satisfies ContainerSchema;

const treeViewConfiguration = new TreeViewConfiguration({ schema: SprintBoard });

/**
 * Creates a new Fluid container or loads an existing one based on the URL hash.
 * Returns a TreeView of the SprintBoard schema.
 */
export async function createOrLoadContainer(): Promise<TreeViewAlpha<typeof SprintBoard>> {
	const client = new TinyliciousClient();

	const createNew = location.hash.length === 0;

	if (createNew) {
		const { container } = await client.createContainer(containerSchema, "2");
		const tree = container.initialObjects.tree;
		const treeView = tree.viewWith(treeViewConfiguration);
		treeView.initialize(sampleSprintBoard());
		const id = await container.attach();
		location.hash = id;
		return asTreeViewAlpha(treeView);
	} else {
		const id = location.hash.slice(1);
		const { container } = await client.getContainer(id, containerSchema, "2");
		const tree = container.initialObjects.tree;
		const treeView = tree.viewWith(treeViewConfiguration);
		return asTreeViewAlpha(treeView);
	}
}
