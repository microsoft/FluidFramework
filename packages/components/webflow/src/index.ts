/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { FlowDocument } from "./document";
export { Editor, IComponentHTMLViewFactory } from "./editor";
export { htmlFormatter } from "./html/formatters";

import { RuntimeFactory } from "@microsoft/fluid-component-base";
import { WebFlow } from "./host";

export const fluidExport = new RuntimeFactory(WebFlow.getFactory());
