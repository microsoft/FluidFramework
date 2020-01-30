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

/**
 * The flow-scroll viewRequestHandler lets the container find the view components it uses directly,
 * without routing through a model component.  The subrequest probably points to the model it should
 * bind to, though it could be view-specific as to what that subrequest contains.
 * This handler has to be on the container in this particular case since webflow always queries the
 * container to find the component pointed at by the markers, but an alternate approach could route
 * to some lower-level component first, which would then reroute to the views it knows about.
 * If other view/model separated components besides just Math would be added, then this handler
 * should expand to route to them as well.
 * @param request - Request that might be a view we can route to
 * @param runtime - Container runtime
 */
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
