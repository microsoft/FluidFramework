/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithScope,
} from "@fluidframework/aqueduct";
import { createNamedDataStore } from "@fluidframework/runtime-utils";

import { VersiontestInstantiationFactory } from "./main";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pkg = require("../package.json");
const fluidPackageName = pkg.name as string;

const defaultFactory = createNamedDataStore(fluidPackageName, VersiontestInstantiationFactory);
const object2Factory = createNamedDataStore("@fluid-internal/version-test-1", VersiontestInstantiationFactory);

export const fluidExport = new ContainerRuntimeFactoryWithScope(
    defaultFactory,
    new Map([
        [defaultFactory.type, Promise.resolve(defaultFactory)],
        [object2Factory.type, Promise.resolve(object2Factory)],
    ]),
);
