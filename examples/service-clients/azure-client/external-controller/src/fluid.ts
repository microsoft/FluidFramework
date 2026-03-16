/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LeveeConnectionConfig } from "@tylerbu/levee-client";
import {
	type ContainerSchema,
	type IFluidContainer,
	SharedTree,
	TreeViewConfiguration,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

import { TwoDiceApp, Dice } from "./schema.js";

const user = {
	id: uuid(),
	name: uuid(),
};

export const connectionConfig: LeveeConnectionConfig = {
	httpUrl: "http://localhost:4000",
	tenantKey: "dev-tenant-secret-key",
	user,
};

/**
 * Schema for the Dice Roller Container.
 * This includes the DataObjects we support and any initial DataObjects we want created
 * when the Container is first created.
 */
export const diceRollerContainerSchema = {
	initialObjects: {
		/* [id]: DataObject */
		tree: SharedTree,
	},
} as const satisfies ContainerSchema;
export type DiceRollerContainerSchema = typeof diceRollerContainerSchema;

const treeViewConfig = new TreeViewConfiguration({
	schema: TwoDiceApp,
	enableSchemaValidation: true,
});

export function loadAppFromExistingContainer(
	container: IFluidContainer<DiceRollerContainerSchema>,
): TwoDiceApp {
	const tree = container.initialObjects.tree;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canView) {
		throw new Error("Expected container data to be compatible with app schema");
	}
	return treeView.root;
}

export function initializeAppForNewContainer(
	container: IFluidContainer<DiceRollerContainerSchema>,
): TwoDiceApp {
	const tree = container.initialObjects.tree;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canInitialize) {
		throw new Error("Expected container data to be compatible with Dice schema");
	}
	treeView.initialize(
		new TwoDiceApp({
			dice1: new Dice({
				value: 1,
			}),
			dice2: new Dice({
				value: 1,
			}),
		}),
	);

	return treeView.root;
}
