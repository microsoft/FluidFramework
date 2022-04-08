/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedString } from "@fluidframework/sequence";
import { TextBoxName } from "./TextBox";
import { TextBox } from "./index";

export const TextBoxInstantiationFactory =
    new DataObjectFactory(
        TextBoxName,
        TextBox,
        [
            SharedString.getFactory(),
        ],
        {},
    );
