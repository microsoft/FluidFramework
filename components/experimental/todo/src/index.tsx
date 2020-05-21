/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@microsoft/fluid-aqueduct";
import { RequestParser, RuntimeRequestHandler } from "@microsoft/fluid-container-runtime";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { MountableView } from "@microsoft/fluid-view-adapters";
import { TodoInstantiationFactory, TodoName, TodoView } from "./Todo";
import { TodoItemView } from "./TodoItem";

const todoComponentId = "todo";

const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const modelRequest = new RequestParser({
                url: `${todoComponentId}`,
                headers: request.headers,
            });
            return TodoView.createFromRequest(modelRequest, runtime);
        }
    };

const todoViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts[0] === "TodoView") {
            const modelRequest = request.createSubRequest(1);
            return TodoView.createFromRequest(modelRequest, runtime);
        }
    };

const todoItemViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts[0] === "TodoItemView") {
            const modelRequest = request.createSubRequest(1);
            return TodoItemView.createFromRequest(modelRequest, runtime);
        }
    };

const registryEntries: NamedComponentRegistryEntries = new Map([
    [TodoName, Promise.resolve(TodoInstantiationFactory)],
]);

const viewRequestHandlers: RuntimeRequestHandler[] = [
    mountableViewRequestHandler(MountableView),
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
        super(registryEntries, [], viewRequestHandlers);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const componentRuntime = await runtime.createComponent(todoComponentId, TodoName);
        const result = await componentRuntime.request({ url: todoComponentId });

        if (result.status !== 200 || result.mimeType !== "fluid/component") {
            throw new Error("Error in creating the default Todo model.");
        }

        componentRuntime.attach();
    }
}

export const fluidExport = new TodoContainerRuntimeFactory();
