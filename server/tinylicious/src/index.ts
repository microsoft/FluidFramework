#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { runService } from "@fluidframework/server-services-utils";
import { TinyliciousResourcesFactory } from "./resourcesFactory";
import { TinyliciousRunnerFactory } from "./runnerFactory";

runService(
    new TinyliciousResourcesFactory(),
    new TinyliciousRunnerFactory(),
    "tinylicious",
    path.join(__dirname, "../config.json"));
