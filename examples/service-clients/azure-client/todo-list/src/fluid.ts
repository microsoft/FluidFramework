/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
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
import { SharedString } from "fluid-framework/legacy";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./azureFunctionTokenProvider.js";
import { TodoList, TodoItem } from "./schema.js";

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
export const todoListContainerSchema = {
	initialObjects: {
		/* [id]: DataObject */
		tree: SharedTree,
	},
	dynamicObjectTypes: [SharedString],
} as const satisfies ContainerSchema;
export type TodoListContainerSchema = typeof todoListContainerSchema;

const treeViewConfig = new TreeViewConfiguration({
	schema: TodoList,
	enableSchemaValidation: true,
});

export function loadAppFromExistingContainer(
	container: IFluidContainer<TodoListContainerSchema>,
): TodoList {
	const tree = container.initialObjects.tree;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canView) {
		throw new Error("Expected container data to be compatible with app schema");
	}
	return treeView.root;
}

export async function initializeAppForNewContainer(
	container: IFluidContainer<TodoListContainerSchema>,
): Promise<TodoList> {
	const tree = container.initialObjects.tree;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canInitialize) {
		throw new Error("Expected container data to be compatible with Dice schema");
	}

	const listTitle = await container.create(SharedString);
	listTitle.insertText(0, "My Todo List");

	const todoItem1Title = await container.create(SharedString);
	todoItem1Title.insertText(0, "Buy groceries");
	const todoItem1Description = await container.create(SharedString);
	const todoItem1 = new TodoItem({
		title: todoItem1Title.handle,
		description: todoItem1Description.handle,
		completed: false,
	});

	const todoItem2Title = await container.create(SharedString);
	todoItem2Title.insertText(0, "Walk the dog");
	const todoItem2Description = await container.create(SharedString);
	const todoItem2 = new TodoItem({
		title: todoItem2Title.handle,
		description: todoItem2Description.handle,
		completed: true,
	});

	treeView.initialize(
		new TodoList({
			title: listTitle.handle,
			items: [todoItem1, todoItem2],
		}),
	);

	return treeView.root;
}
