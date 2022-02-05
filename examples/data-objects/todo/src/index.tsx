/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IRequest } from "@fluidframework/core-interfaces";
import { TodoInstantiationFactory, TodoName } from "./Todo";

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TodoInstantiationFactory,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
    undefined,
    [innerRequestHandler],
);
