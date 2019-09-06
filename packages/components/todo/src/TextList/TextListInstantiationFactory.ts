/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponentFactory,
} from "@prague/aqueduct";
import { IComponentFactory } from "@prague/runtime-definitions";

import { SharedString } from "@prague/sequence";
import { TextList } from "./index";

export const TextListInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TextList,
    [
        SharedString.getFactory(),
    ],
);
