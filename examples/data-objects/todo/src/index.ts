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
        const todo = await requestFluidObject<Todo>(
            await runtime.getRootDataStore(todoId),
            objectRequest,
        );
        const viewResponse = React.createElement(TodoView, { todoModel: todo, getDirectLink });
        return { status: 200, mimeType: "fluid/object", value: viewResponse };
    }
};

const todoItemRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 1 && request.pathParts[0] !== todoId) {
        // To get a TodoItem from the Todo, we retrieve the Todo same as above but then issue a further request
        // to that TodoItem with the TodoItem's id.
        // The downside of this approach is that we must realize the Todo to get at its TodoItems (rather than
        // accessing them directly).  But the positive is that we can use encapsulated handles rather than making
        // assumptions about the ids or making the TodoItems roots.
        const objectRequest = RequestParser.create({
            url: request.pathParts[0],
            headers: request.headers,
        });
        const todoItem = await requestFluidObject<TodoItem>(
            await runtime.getRootDataStore(todoId),
            objectRequest,
        );

        if (todoItem !== undefined) {
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
