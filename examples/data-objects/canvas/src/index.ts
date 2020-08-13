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

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const CanvasName = pkg.name as string;

export const CanvasInstantiationFactory = new DataObjectFactory(
    CanvasName,
    Canvas,
    [
        Ink.getFactory(),
    ],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    CanvasName,
    new Map([
        [CanvasName, Promise.resolve(CanvasInstantiationFactory)],
    ]),
);
