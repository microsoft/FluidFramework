/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { runService } from "@microsoft/fluid-server-services-utils";
import * as path from "path";
import { TinyliciousResourcesFactory } from "./resourcesFactory";
import { TinyliciousRunnerFactory } from "./runnerFactory";

runService(
    new TinyliciousResourcesFactory(),
    new TinyliciousRunnerFactory(),
    "tinylicious",
    path.join(__dirname, "../config.json"));
