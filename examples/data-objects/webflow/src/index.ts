/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { FlowDocument } from "./document";
export { Editor, IFluidHTMLViewFactory } from "./editor";
export { htmlFormatter } from "./html/formatters";

import { RuntimeFactory } from "@fluidframework/data-object-base";
import { WebFlow } from "./host";

export const fluidExport = new RuntimeFactory(WebFlow.getFactory());
