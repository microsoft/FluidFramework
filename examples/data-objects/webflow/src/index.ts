/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";

export { FlowDocument } from "./document";
export { Editor } from "./editor";
import { WebFlow, WebflowView } from "./host";
export { htmlFormatter } from "./html/formatters";

const webFlowViewCallback = (webFlow: WebFlow) => new WebflowView(webFlow.getFlowDocument());

export const fluidExport = new ContainerViewRuntimeFactory(WebFlow.getFactory(), webFlowViewCallback);
