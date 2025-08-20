/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
// eslint-disable-next-line import/no-internal-modules -- #26985: `test-runtime-utils` internal used in example
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import {
	type ContainerSchema,
	type IFluidContainer,
	SharedTree,
	TreeViewConfiguration,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider.js";
import { TwoDiceApp, Dice } from "./schema.js";

export interface ICustomUserDetails {
	gender: string;
	email: string;
}

const userDetails: ICustomUserDetails = {
	gender: "female",
	email: "xyz@microsoft.com",
};

// Define the server we will be using and initialize Fluid
const useAzure = process.env.FLUID_CLIENT === "azure";

const user = {
	id: uuid(),
	name: uuid(),
};

const azureUser = {
	id: user.id,
	name: user.name,
	additionalDetails: userDetails,
};

export const connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig =
	useAzure
		? {
				type: "remote",
				tenantId: "",
				tokenProvider: new AzureFunctionTokenProvider("", azureUser),
				endpoint: "",
			}
		: {
				type: "local",
				tokenProvider: new InsecureTokenProvider("fooBar", user),
				endpoint: "http://localhost:7070",
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
