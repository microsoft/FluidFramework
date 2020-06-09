/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SharedString } from "@fluidframework/sequence";
import { TextListName } from "./TextList";
import { TextList } from "./index";

export const TextListInstantiationFactory = new PrimedComponentFactory(
    TextListName,
    TextList,
    [
        SharedString.getFactory(),
    ],
    {});
