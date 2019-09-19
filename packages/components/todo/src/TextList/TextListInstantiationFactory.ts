/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { PrimedComponentFactory } from "@prague/aqueduct";
import { TextList } from "./index";

export const TextListInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TextList,
    [
        SharedString.getFactory(),
    ],
);
