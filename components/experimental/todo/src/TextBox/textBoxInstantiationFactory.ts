/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextBoxName } from "./TextBox";
import { TextBox } from "./index";

export const TextBoxInstantiationFactory = new PrimedComponentFactory(
    TextBoxName,
    TextBox,
    [
        SharedString.getFactory(),
    ],
    {});
