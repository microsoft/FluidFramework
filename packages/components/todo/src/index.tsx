/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@microsoft/fluid-aqueduct";
import { RequestParser } from "@microsoft/fluid-container-runtime";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { TodoInstantiationFactory, TodoName, TodoView } from "./Todo";
import { TodoItemView } from "./TodoItem";

const todoComponentId = "todo";

const defaultViewRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length === 0) {
            return runtime.request(new RequestParser({
                url: `TodoView/${todoComponentId}`,
                headers: request.headers,
            }));
        }
    };

const todoViewRequestHandler = async (request: RequestParser, runtime: IHostRuntime) => {
    if (request.pathParts[0] === "TodoView") {
        const modelRequest = request.createSubRequest(1);
        return TodoView.createFromRequest(modelRequest, runtime);
    }
};

const todoItemViewRequestHandler = async (request: RequestParser, runtime: IHostRuntime) => {
    if (request.pathParts[0] === "TodoItemView") {
        const modelRequest = request.createSubRequest(1);
        return TodoItemView.createFromRequest(modelRequest, runtime);
    }
};

const registryEntries = new Map([
    [TodoName, Promise.resolve(TodoInstantiationFactory)],
]);

const requestHandlers = [
    defaultViewRequestHandler,
    todoViewRequestHandler,
    todoItemViewRequestHandler,
];

/**
 * The TodoContainerRuntimeFactory is an example of what a container author might write to combine the separated views
 * and models and offer direct links to TodoViews and TodoItemViews via the request handlers.
 */
class TodoContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], requestHandlers);
    }

    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        const componentRuntime = await runtime.createComponent(todoComponentId, TodoName);
        const result = await componentRuntime.request({ url: "/" });

        if (result.status !== 200 || result.mimeType !== "fluid/component") {
            throw new Error("Error in creating the default Todo model.");
        }

        componentRuntime.attach();
    }
}

export const fluidExport = new TodoContainerRuntimeFactory();
