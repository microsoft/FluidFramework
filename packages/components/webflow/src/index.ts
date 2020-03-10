/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { FlowDocument } from "./document";
export { Editor, IComponentHTMLViewFactory } from "./editor";
export { htmlFormatter } from "./html/formatters";

import { RuntimeFactory, LazyComponentFactory } from "@microsoft/fluid-component-base";
import { hostType } from "./package";

export const fluidExport = new RuntimeFactory(
    new LazyComponentFactory(
        hostType,
        async () => import("./host").then((m) => m.WebFlow.getFactory()),
    ));
