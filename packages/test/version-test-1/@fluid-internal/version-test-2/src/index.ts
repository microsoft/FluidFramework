/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidDataStoreRegistry } from "@fluidframework/runtime-utils";

import { VersiontestInstantiationFactory } from "./main";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pkg = require("../package.json");
const fluidPackageName = pkg.name as string;

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    fluidPackageName,
    new FluidDataStoreRegistry([
        [fluidPackageName, Promise.resolve(VersiontestInstantiationFactory)],
        ["@fluid-internal/version-test-1", Promise.resolve(VersiontestInstantiationFactory)],
    ]),
);
