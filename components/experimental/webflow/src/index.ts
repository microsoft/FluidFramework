/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { FlowDocument } from "./document";
export { Editor, IComponentHTMLViewFactory } from "./editor";
export { htmlFormatter } from "./html/formatters";

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { WebFlow, WebFlowName } from "./host";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    WebFlowName,
    new Map([
        WebFlow.getFactory().registryEntry,
    ]),
);
