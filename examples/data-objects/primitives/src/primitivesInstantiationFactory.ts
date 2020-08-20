/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { PrimitivesCollection, PrimitivesName } from "./main";

/**
 * The DataObjectFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const PrimitivesInstantiationFactory = new DataObjectFactory(
    PrimitivesName,
    PrimitivesCollection,
    [
        SharedMap.getFactory(),
    ],
    {},
);
