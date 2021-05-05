/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";
import { TextBoxName } from "./TextBox";
import { TextBox } from "./index";

export const TextBoxInstantiationFactory =
    // eslint-disable-next-line @typescript-eslint/ban-types
    new DataObjectFactory<TextBox, object, string, IEvent>(
        TextBoxName,
        TextBox,
        [
            SharedString.getFactory(),
        ],
        {},
    );
