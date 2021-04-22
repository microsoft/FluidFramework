/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";
import { TextListName } from "./TextList";
import { TextList } from "./index";

export const TextListInstantiationFactory =
    new DataObjectFactory<TextList, undefined, undefined, IEvent>(
        TextListName,
        TextList,
        [
            SharedString.getFactory(),
        ],
        {},
    );
