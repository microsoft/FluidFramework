/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { mathViewRequestHandler } from "@fluid-example/math";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { WebFlowHost, webFlowHostFactory } from "./host";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowHost.type,
    new Map([
        [WebFlowHost.type, Promise.resolve(webFlowHostFactory)],
    ]),
    undefined, // serviceRegistry
    [ mathViewRequestHandler ],
);
