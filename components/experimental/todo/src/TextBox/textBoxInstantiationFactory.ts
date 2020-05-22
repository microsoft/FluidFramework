/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SharedString } from "@fluidframework/sequence";
import { TextBoxName } from "./TextBox";
import { TextBox } from "./index";

export const TextBoxInstantiationFactory = new PrimedComponentFactory(
    TextBoxName,
    TextBox,
    [
        SharedString.getFactory(),
    ],
    {});
