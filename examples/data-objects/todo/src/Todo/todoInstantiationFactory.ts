/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { TodoItem } from "../TodoItem";

import { TodoName } from "./Todo";
import { Todo } from "./index";

export const TodoInstantiationFactory =
    new DataObjectFactory(
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
