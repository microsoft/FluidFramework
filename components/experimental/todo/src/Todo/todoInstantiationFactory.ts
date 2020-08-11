/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { TodoItem } from "../TodoItem";

import { Todo } from "./index";

export const TodoInstantiationFactory: IFluidDataStoreFactory = new DataObjectFactory(
    "@fluid-example/todo",
    Todo,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
    {},
    [
        TodoItem.getFactory().registryEntry,
    ],
);
