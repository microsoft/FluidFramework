/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";

export const webflowType = "@fluid-example/webflow";
export const FlowDocumentType = "@chaincode/flow-document";

export const fluidExport = new SimpleModuleInstantiationFactory(
    webflowType,
    new Map([
        [webflowType, import(/* webpackChunkName: "webflow", webpackPreload: true */ "./host").then((m) => m.webFlowFactory)],
        [FlowDocumentType, import(/* webpackChunkName: "flowdoc", webpackPreload: true */ "./document").then((m) => m.flowDocumentFactory)],
    ]),
);
