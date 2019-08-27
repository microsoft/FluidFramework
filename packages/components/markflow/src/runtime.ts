/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext } from "@prague/runtime-definitions";

export const webflowType = "@chaincode/webflow";
export const flowDocumentType = "@chaincode/flow-document";

export const fluidExport = new SimpleModuleInstantiationFactory(
    webflowType,
    new Map([
        [webflowType, import("./host").then((m) => m.webFlowFactory)],
        [flowDocumentType, import("./document").then((m) => m.flowDocumentFactory)],
    ]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
      return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
