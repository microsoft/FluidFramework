/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { runService } from "@microsoft/fluid-server-services-utils";
import * as path from "path";
import { GatewayResourcesFactory, GatewayRunnerFactory } from "./runnerFactory";

runService(
    new GatewayResourcesFactory(),
    new GatewayRunnerFactory(),
    "alfred",
    path.join(__dirname, "../config.json"));
