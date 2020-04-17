/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextListName } from "./TextList";
import { TextList } from "./index";

export const TextListInstantiationFactory = new PrimedComponentFactory(
    TextListName,
    TextList,
    [
        SharedString.getFactory(),
    ],
);
