/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RuntimeFactory } from "@microsoft/fluid-component-base";
import { WebFlowHost } from "./host";

export const fluidExport = new RuntimeFactory(WebFlowHost.getFactory());
