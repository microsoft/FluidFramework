/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { Ink } from "@fluidframework/ink";
import { Canvas } from "./canvas";

export const CanvasInstantiationFactory = new DataObjectFactory(
    "Canvas",
    Canvas,
    [
        Ink.getFactory(),
    ],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    CanvasInstantiationFactory,
    new Map([
        [CanvasInstantiationFactory.type, Promise.resolve(CanvasInstantiationFactory)],
    ]),
);
