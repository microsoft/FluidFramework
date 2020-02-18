/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import { PrimitivesCollection } from "./main";

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const PrimitivesInstantiationFactory = new PrimedComponentFactory(
    PrimitivesCollection,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
    ],
);
