/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    // ContainerRuntimeFactoryWithDefaultDataStore,
    mountableViewRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import React from "react";
import { Todo, TodoInstantiationFactory } from "./Todo";
import { TodoView } from "./Todo/TodoView";
import { TodoItem } from "./TodoItem";
import { TodoItemView } from "./TodoItem/TodoItemView";

const todoId = "todo";

// NOTE: Normally url logic should belong to the app (not the container code).  This way the app retains control
// over its url format (e.g. here, the /doc/containerName path is actually determined by webpack-fluid-loader).
// It's entirely possible that an app may choose not to permit direct linking even.
// It is, however, appropriate for the container code to define the in-container routing (e.g. /itemId).
const getDirectLink = (itemId: string) => {
    const pathParts = window.location.pathname.split("/");
    const containerName = pathParts[2];

    return `/doc/${containerName}/${itemId}`;
};

// The todoRequestHandler provides a TodoView for either a request for "todo" or for an empty request.  Since we wrap
// it with a mountableViewRequestHandler below, the view will be wrapped in a MountableView if the requester includes
// the mountableView request header.
const todoRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (
        request.pathParts.length === 0
        || request.pathParts.length === 1 && request.pathParts[0] === todoId
    ) {
        const objectRequest = RequestParser.create({
            url: ``,
            headers: request.headers,
        });
        const model = await requestFluidObject<Todo>(
            await runtime.getRootDataStore(todoId),
            objectRequest,
        );
        const viewResponse = React.createElement(TodoView, { todoModel: model, getDirectLink });
        return { status: 200, mimeType: "fluid/object", value: viewResponse };
    }
};

const todoItemRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 1 && request.pathParts[0] !== todoId) {
        // NOTE: This approach is not ideal, since it makes some assumptions about how the ContainerRuntime
        // resolves handles.  Alternative approaches that could be considered with their own tradeaoffs:
        // - Make the TodoItems as rootDataStores, allowing them to still be directly loaded without having to route
        //   through another intermediate data store.  But, then we're generating extra roots.
        // - Use a single rootDataStore to act as a directory to handles for our TodoItems.  This would avoid
        //   excessive roots, but would require a double-route through this intermediate data store.
        const response = await runtime.IFluidHandleContext.resolveHandle(request);
        if (response.status === 200 && response.mimeType === "fluid/object") {
            const todoItem = response.value as TodoItem;
            const viewResponse = React.createElement(TodoItemView, { todoItemModel: todoItem, getDirectLink });
            return { status: 200, mimeType: "fluid/object", value: viewResponse };
        }
    }
};

class TodoContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                TodoInstantiationFactory.registryEntry,
            ]),
            undefined,
            [mountableViewRequestHandler(MountableView, [todoRequestHandler, todoItemRequestHandler])],
        );
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(TodoInstantiationFactory.type, todoId);
    }
}

export const fluidExport = new TodoContainerRuntimeFactory();
