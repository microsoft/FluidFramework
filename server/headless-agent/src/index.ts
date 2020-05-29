/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { runService } from "@fluidframework/server-services-utils";
import { HeadlessResourcesFactory, HeadlessRunnerFactory } from "./runnerFactory";

runService(
    new HeadlessResourcesFactory(),
    new HeadlessRunnerFactory(),
    "headless-agent",
    path.join(__dirname, "../config.json"));
