/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

export { FlowDocument } from "./document/index.js";
export { Editor } from "./editor/index.js";
import { WebFlow, WebflowView } from "./host/index.js";
export { htmlFormatter } from "./html/formatters.js";

const webFlowViewCallback = (webFlow: WebFlow): React.ReactElement =>
	React.createElement(WebflowView, { docP: webFlow.getFlowDocument() });

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	WebFlow.getFactory(),
	webFlowViewCallback,
);
