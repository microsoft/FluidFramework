/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore
} from "@fluidframework/aqueduct";

import { VersiontestInstantiationFactory } from "./main";

const pkg = require("../package.json");
const fluidPackageName = pkg.name as string;

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    fluidPackageName,
    new Map([
        [fluidPackageName, Promise.resolve(VersiontestInstantiationFactory)],
        ["@fluid-internal/version-test-1", Promise.resolve(VersiontestInstantiationFactory)],
    ]),
);
