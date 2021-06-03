/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { Ink } from "@fluidframework/ink";
import { Canvas } from "./canvas";

export const CanvasInstantiationFactory =
    new DataObjectFactory<Canvas, undefined, undefined, IEvent>(
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
