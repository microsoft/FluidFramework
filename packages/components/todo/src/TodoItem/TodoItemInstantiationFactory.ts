/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    SharedComponentFactory,
} from "@prague/aqueduct";
import {
    SharedCell,
} from "@prague/cell";
import {
    CounterValueType,
    SharedMap,
} from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import {
    SharedString,
} from "@prague/sequence";

import { TodoItem } from "./index";

export const TodoItemInstantiationFactory: IComponentFactory = new SharedComponentFactory(
    TodoItem,
    [
        SharedMap.getFactory([new CounterValueType()]),
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
);
