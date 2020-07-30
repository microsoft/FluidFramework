/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore
} from "@fluidframework/aqueduct";

import { VersiontestInstantiationFactory } from "./main";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const fluidPackageName = pkg.name as string;

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    fluidPackageName,
    new Map([
        [fluidPackageName, Promise.resolve(VersiontestInstantiationFactory)],
    ]),
);
