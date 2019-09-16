/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponentFactory,
} from "@prague/aqueduct";
import {
    SharedCell,
} from "@microsoft/fluid-cell";
import {
    SharedMap,
} from "@microsoft/fluid-map";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import {
    SharedString,
} from "@microsoft/fluid-sequence";

import { Todo } from "./index";

export const TodoInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    Todo,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
);
