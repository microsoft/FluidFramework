/* eslint-disable @typescript-eslint/no-var-requires */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
} from "@fluidframework/aqueduct";

import { VersiontestInstantiationFactory } from "./main";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json");
const fluidPackageName = pkg.name as string;

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    fluidPackageName,
    new Map([
        [fluidPackageName, Promise.resolve(VersiontestInstantiationFactory)],
    ]),
);
