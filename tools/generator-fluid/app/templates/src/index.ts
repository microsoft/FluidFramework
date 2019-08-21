/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SimpleModuleInstantiationFactory
} from "@prague/aqueduct";

import {} from "./main";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the 
 * EmbeddedComponentLoader.
 * 
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    chaincodeName,
    new Map([
            [chaincodeName, Promise.resolve(ComponentInstantiationFactory)],
    ]),
);
