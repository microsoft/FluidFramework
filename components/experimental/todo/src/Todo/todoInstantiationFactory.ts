/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { TodoItem } from "../TodoItem";

import { TodoName } from "./Todo";
import { Todo } from "./index";

export const TodoInstantiationFactory: IFluidDataStoreFactory = new PrimedComponentFactory(
    TodoName,
    Todo,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
    {},
    new Map([
        TodoItem.getFactory().registryEntry,
    ]),
);
