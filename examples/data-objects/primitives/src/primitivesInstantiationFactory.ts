/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedMap } from "@fluidframework/map";
import { PrimitivesCollection, PrimitivesName } from "./main";

/**
 * The DataObjectFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const PrimitivesInstantiationFactory =
    // eslint-disable-next-line @typescript-eslint/ban-types
    new DataObjectFactory<PrimitivesCollection, undefined, undefined, IEvent>(
        PrimitivesName,
        PrimitivesCollection,
        [
            SharedMap.getFactory(),
        ],
        {},
    );
