/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

export { FlowDocument } from "./document";
export { Editor } from "./editor";
import { WebFlow } from "./host";
import { WebflowViewNew } from "./host/webflowView";
export { htmlFormatter } from "./html/formatters";

// const webFlowViewCallback = (webFlow: WebFlow) => new WebflowView(webFlow.getFlowDocument());
const webFlowViewCallback = (webFlow: WebFlow) => React.createElement(
    WebflowViewNew,
    { docP: webFlow.getFlowDocument() },
);

export const fluidExport = new ContainerViewRuntimeFactory(WebFlow.getFactory(), webFlowViewCallback);
