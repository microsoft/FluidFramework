/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { FlowDocument, flowDocumentFactory } from "./document";
import { WebFlow, webFlowFactory } from "./host";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlow.type,
    new Map([
        [WebFlow.type, Promise.resolve(webFlowFactory)],
        [FlowDocument.type, Promise.resolve(flowDocumentFactory)],
    ]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
      return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    return fluidExport.instantiateComponent(context);
}
