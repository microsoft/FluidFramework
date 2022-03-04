/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import * as sequence from "@fluidframework/sequence";
import { MonacoRunner } from "./dataObject";

const monacoName = "@fluid-example/monaco";

const componentFactory = new DataObjectFactory(
    monacoName,
    MonacoRunner,
    [
        sequence.SharedString.getFactory(),
    ],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    componentFactory,
    new Map([
        [monacoName, Promise.resolve(componentFactory)],
    ]),
);
