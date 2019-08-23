/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponentFactory,
} from "@prague/aqueduct";
import { IComponentFactory } from "@prague/runtime-definitions";
import {
    SharedString,
} from "@prague/sequence";

import { TextBox } from "./index";

export const TextBoxInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TextBox,
    [
        SharedString.getFactory(),
    ],
);
