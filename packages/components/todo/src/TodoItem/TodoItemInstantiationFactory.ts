/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell } from "@microsoft/fluid-cell";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { PrimedComponentFactory } from "@prague/aqueduct";
import { TodoItem } from "./index";

export const TodoItemInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TodoItem,
    [
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
);
