/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MathView } from "@fluid-example/math";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { RequestParser } from "@microsoft/fluid-container-runtime";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { WebFlowHost, webFlowHostFactory } from "./host";


async function viewRequestHandler(request: IRequest, runtime: IHostRuntime) {
    const requestParser = new RequestParser(request);
    const pathParts = requestParser.pathParts;

    if (pathParts[0] === "MathView") {
        const modelRequest = requestParser.createSubRequest(1);
        return MathView.request(modelRequest, runtime);
    }
}

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowHost.type,
    new Map([
        [WebFlowHost.type, Promise.resolve(webFlowHostFactory)],
    ]),
    undefined, // serviceRegistry
    [ viewRequestHandler ],
);
