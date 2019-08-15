/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    SharedComponentFactory,
} from "@prague/aqueduct";
import {
    SharedDirectory,
} from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import {
    SharedString,
} from "@prague/sequence";

import { TextBox } from "./index";

export const TextBoxInstantiationFactory: IComponentFactory = new SharedComponentFactory(
    TextBox,
    [
        SharedDirectory.getFactory(),
        SharedString.getFactory(),
    ],
);
