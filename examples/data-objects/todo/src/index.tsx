/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    ContainerRuntimeFactoryWithDefaultDataStore,
    mountableViewRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
// import { rootDataStoreRequestHandler } from "@fluidframework/request-handler";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import React from "react";
import { Todo, TodoInstantiationFactory } from "./Todo";
import { TodoView } from "./Todo/TodoView";

const todoId = "todo";

const getDirectLink = (itemId: string) => {
    const pathParts = window.location.pathname.split("/");
    const containerName = pathParts[2];

    return `/doc/${containerName}/${itemId}`;
};

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TodoInstantiationFactory,
    new Map([
        TodoInstantiationFactory.registryEntry,
    ]),
    undefined,
    [innerRequestHandler],
);

// The defaultViewRequestHandler responds to empty requests with the default view (a DiceRollerView).  Since we wrap
// it with a mountableViewRequestHandler below, the view will be wrapped in a MountableView if the requester includes
// the mountableView request header.
const defaultViewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 0) {
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

class TodoContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                TodoInstantiationFactory.registryEntry,
            ]),
            undefined,
            [mountableViewRequestHandler(MountableView, [defaultViewRequestHandler, innerRequestHandler])],
        );
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(TodoInstantiationFactory.type, todoId);
    }
}

export const TaskSelectionFactory = new TodoContainerRuntimeFactory();
