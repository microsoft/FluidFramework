/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { TodoItem } from "./index";

export const TodoItemInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TodoItem,
    [
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
);
