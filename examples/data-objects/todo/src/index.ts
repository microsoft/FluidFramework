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
import { Todo, TodoFactory, TodoView } from "./Todo";
import { TodoItem, TodoItemView } from "./TodoItem";

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

// The todoRequestHandler provides a TodoView for an empty request, or a TodoItemView for a request with the item id.
// Since we wrap it with a mountableViewRequestHandler below, the view will be wrapped in a MountableView if the
// requester includes the mountableView request header.
const todoRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    // This handler will provide a TodoView for requests of length 0, or a TodoItemView for requests of length 1.
    // Otherwise return nothing.
    if (request.pathParts.length > 1) {
        return undefined;
    }

    const objectRequest = RequestParser.create({
        url: ``,
        headers: request.headers,
    });
    const todo = await requestFluidObject<Todo>(
        await runtime.getRootDataStore(todoId),
        objectRequest,
    );

    if (request.pathParts.length === 0) {
        const viewResponse = React.createElement(TodoView, { todoModel: todo, getDirectLink });
        return { status: 200, mimeType: "fluid/object", value: viewResponse };
    } else {
        // To get a TodoItem, we first get the Todo and then retrieve the specific item.
        // The downside of this approach is that we must realize the Todo to get at its TodoItems (rather than
        // accessing them directly).  But the positive is that we can use encapsulated handles rather than making
        // assumptions about the ids or making the TodoItems roots.
        const todoItemId = request.pathParts[0];

        // This retry logic really shouldn't be necessary -- we should be able to get the TodoItem straightaway.
        // This is working around a bug (?) where we are starting before reaching connected state so we might not
        // have seen the op setting the handle in the map yet.
        let todoItem: TodoItem | undefined;
        while (todoItem === undefined) {
            const todoItemsChangedP = new Promise<void>((resolve) => {
                todo.once("todoItemsChanged", () => {
                    resolve();
                });
            });
            todoItem = await todo.getTodoItem(todoItemId);
            if (todoItem === undefined) {
                await todoItemsChangedP;
            }
        }
        const viewResponse = React.createElement(TodoItemView, { todoItemModel: todoItem });
        return { status: 200, mimeType: "fluid/object", value: viewResponse };
    }
};

class TodoContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                TodoFactory.registryEntry,
            ]),
            undefined,
            [mountableViewRequestHandler(MountableView, [todoRequestHandler])],
        );
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(TodoFactory.type, todoId);
    }
}

export const fluidExport = new TodoContainerRuntimeFactory();
