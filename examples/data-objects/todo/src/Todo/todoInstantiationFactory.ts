/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import { TodoItem } from "../TodoItem";

import { TodoName } from "./Todo";
import { Todo } from "./index";

export const TodoInstantiationFactory =
    new DataObjectFactory<Todo, undefined, undefined, IEvent>(
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
