/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { FlowDocument } from "./document";
export { Editor, IFluidHTMLViewFactory } from "./editor";
export { htmlFormatter } from "./html/formatters";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { WebFlow } from "./host";
import { hostType } from "./package";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    WebFlow.getFactory(),
    [[hostType, Promise.resolve(WebFlow.getFactory())]],
);
