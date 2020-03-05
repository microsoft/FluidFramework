/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";

import { TextareaNoReactInstantiationFactory } from "./main";

const chaincodeName = TextareaNoReactInstantiationFactory.type;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also
 * enables dynamic loading in the EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    chaincodeName,
    new Map([
        [chaincodeName,
            Promise.resolve(TextareaNoReactInstantiationFactory)],
    ]),
);

// Export necessary members from main.tsx:
export {
    TextareaNoReact,
    TextareaNoReactInstantiationFactory,
} from "./main";
