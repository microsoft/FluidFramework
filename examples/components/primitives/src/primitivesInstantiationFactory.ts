/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedMap } from "@microsoft/fluid-map";
import { PrimitivesCollection, PrimitivesName } from "./main";

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const PrimitivesInstantiationFactory = new PrimedComponentFactory(
    PrimitivesName,
    PrimitivesCollection,
    [
        SharedMap.getFactory(),
    ],
    {},
);
