/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";

import { DiceRollerInstantiationFactory } from "./main";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
const componentName = pkg.name as string;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 *
 * In this example, we are only registering a single component, but more complex examples will register multiple
 * components.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [componentName, Promise.resolve(DiceRollerInstantiationFactory)],
    ]),
);
