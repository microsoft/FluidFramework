/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidMountableViewEntryPoint,
	MountableView,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { FluidObject } from "@fluidframework/core-interfaces";
import React from "react";

import { Todo, TodoFactory, TodoView } from "./Todo/index.js";
import { TodoItem, TodoItemView } from "./TodoItem/index.js";

const todoId = "todo";

const getDirectLink = (itemId: string) => {
	const pathParts = window.location.pathname.split("/");
	const containerName = pathParts[2];

	// NOTE: Normally the logic getting from the url to the container should belong to the app (not the container code).
	// This way the app retains control over its url format (e.g. here, the /doc/containerName path is actually
	// determined by webpack-fluid-loader).  It's entirely possible that an app may even choose not to permit direct
	// linking.
	const urlToContainer = `/doc/${containerName}`;

	// It is, however, appropriate for the container code to define the in-container routing (e.g. /itemId).
	return `${urlToContainer}/${itemId}`;
};

const getTodoView = async (todoObject: Todo, path?: string) => {
	if (path === undefined || path.length === 0) {
		return React.createElement(TodoView, { todoModel: todoObject, getDirectLink });
	} else {
		// This retry logic really shouldn't be necessary -- we should be able to get the TodoItem straightaway.
		// This is working around a bug (?) where we are starting before reaching connected state so we might not
		// have seen the op setting the handle in the map yet.
		let todoItem: TodoItem | undefined;
		while (todoItem === undefined) {
			const todoItemsChangedP = new Promise<void>((resolve) => {
				todoObject.once("todoItemsChanged", () => {
					resolve();
				});
			});
			todoItem = await todoObject.getTodoItem(path);
			if (todoItem === undefined) {
				await todoItemsChangedP;
			}
		}
		return React.createElement(TodoItemView, { todoItemModel: todoItem });
	}
};

class TodoContainerRuntimeFactory extends BaseContainerRuntimeFactory {
	constructor() {
		super({
			registryEntries: new Map([TodoFactory.registryEntry]),
			provideEntryPoint: async (
				runtime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const todoDataObject = await getDataStoreEntryPoint<Todo>(runtime, todoId);

				const getDefaultView = async (path?: string): Promise<any> =>
					getTodoView(todoDataObject, path);

				return {
					getDefaultDataObject: async () => todoDataObject as FluidObject,
					getMountableDefaultView: async (path?: string) => {
						const view = await getDefaultView(path);
						if (MountableView.canMount(view)) {
							return new MountableView(view);
						}
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return view;
					},
				};
			},
		});
	}

	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(TodoFactory.type);
		await dataStore.trySetAlias(todoId);
	}
}

/**
 * @internal
 */
export const fluidExport = new TodoContainerRuntimeFactory();
