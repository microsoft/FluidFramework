/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedString } from "@fluidframework/sequence";
import { TextListName } from "./TextList";
import { TextList } from "./index";

export const TextListInstantiationFactory =
    new DataObjectFactory(
        TextListName,
        TextList,
        [
            SharedString.getFactory(),
        ],
        {},
    );
