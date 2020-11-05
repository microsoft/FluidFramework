/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import { TodoItem } from "../TodoItem";

import { TodoName } from "./Todo";
import { Todo } from "./index";

export const TodoInstantiationFactory = new DataObjectFactory(
    TodoName,
    Todo,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
        SharedCell.getFactory(),
        SharedObjectSequence.getFactory(),
    ],
    {},
    new Map([
        TodoItem.getFactory().registryEntry,
    ]),
);
