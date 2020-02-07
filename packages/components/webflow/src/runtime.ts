/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

export const WebFlowType = "@fluid-example/webflow";
export const FlowDocumentType = "@chaincode/flow-document";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowType,
    new Map([
        [WebFlowType, import(/* webpackChunkName: "webflow", webpackPreload: true */ "./host").then((m) => m.webFlowFactory)],
    ]),
);
