/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponentFactory,
} from "@prague/aqueduct";
import {
    SharedCell,
} from "@prague/cell";
import { IComponentFactory } from "@prague/runtime-definitions";
import {
    SharedString,
} from "@prague/sequence";

import { TodoItem } from "./index";

export const TodoItemInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TodoItem,
    [
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
);
