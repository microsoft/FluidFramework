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
import { SharedString } from "fluid-framework/legacy";
import { v4 as uuid } from "uuid";

import { AzureFunctionTokenProvider } from "./azureFunctionTokenProvider.js";
import { TodoItem, TodoList } from "./schema.js";

// Define the server we will be using and initialize Fluid
const useAzure = process.env.FLUID_CLIENT === "azure";

const user = {
	id: uuid(),
	name: uuid(),
};

const azureUser = {
	id: user.id,
	name: user.name,
	additionalDetails: {
		gender: "female",
		email: "xyz@microsoft.com",
	},
};

/**
 * Azure Fluid Relay connection configuration.
 */
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
 * Schema for the TODO list application.
 * @remarks
 * This includes the DataObjects we support and any initial DataObjects we want created
 * when the Container is first created.
 */
export const todoListContainerSchema = {
	initialObjects: {
		todoList: SharedTree,
	},
	dynamicObjectTypes: [SharedString],
} as const satisfies ContainerSchema;
/**
 * Container schema type for the Todo List application.
 */
export type TodoListContainerSchema = typeof todoListContainerSchema;

const treeViewConfig = new TreeViewConfiguration({
	schema: TodoList,
	enableSchemaValidation: true,
});

/**
 * Loads the application model from an existing Fluid Container.
 */
export function loadAppFromExistingContainer(
	container: IFluidContainer<TodoListContainerSchema>,
): TodoList {
	const tree = container.initialObjects.todoList;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canView) {
		throw new Error("Expected container data to be compatible with app schema");
	}
	return treeView.root;
}

/**
 * Initializes the application model for a newly created Fluid Container.
 * @remarks
 * Includes population of the initial TodoList contents.
 */
export async function initializeAppForNewContainer(
	container: IFluidContainer<TodoListContainerSchema>,
): Promise<TodoList> {
	const tree = container.initialObjects.todoList;
	const treeView = tree.viewWith(treeViewConfig);
	if (!treeView.compatibility.canInitialize) {
		throw new Error("Expected container data to be compatible with TodoList schema");
	}

	const initialTodoList = await createInitialTodoList(container);
	treeView.initialize(initialTodoList);

	return treeView.root;
}

async function createInitialTodoList(
	container: IFluidContainer<TodoListContainerSchema>,
): Promise<TodoList> {
	const listTitle = await container.create(SharedString);
	listTitle.insertText(0, "My to-do list");

	const todoItem1 = await createTodoItem({
		container,
		completed: false,
		initialTitleText: "Buy groceries",
	});
	const todoItem2 = await createTodoItem({
		container,
		completed: true,
		initialTitleText: "Walk the dog",
	});
	return new TodoList({
		title: listTitle.handle,
		items: [todoItem1, todoItem2],
	});
}

/**
 * Creates a new {@link TodoItem}, using the provided Fluid container to generate `SharedString`
 * DDSs for use as the item's title and description.
 */
export async function createTodoItem({
	container,
	completed,
	initialTitleText,
	initialDescriptionText,
}: {
	container: IFluidContainer;
	completed: boolean;
	initialTitleText?: string;
	initialDescriptionText?: string;
}): Promise<TodoItem> {
	const title = await container.create(SharedString);
	if (initialTitleText !== undefined) {
		title.insertText(0, initialTitleText);
	}
	const description = await container.create(SharedString);
	if (initialDescriptionText !== undefined) {
		description.insertText(0, initialDescriptionText);
	}
	return new TodoItem({
		title: title.handle,
		description: description.handle,
		completed,
	});
}
