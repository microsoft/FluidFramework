/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    SimpleComponentInstantiationFactory,
} from "@prague/aqueduct";
import {
    SharedMap,
} from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import {
    SharedString,
} from "@prague/sequence";

import { TextBox } from "./index";

export const TextBoxInstantiationFactory: IComponentFactory = new SimpleComponentInstantiationFactory(
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
    ],
    TextBox.load,
);
