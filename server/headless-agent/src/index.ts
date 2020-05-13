/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { runService } from "@microsoft/fluid-server-services-utils";
import path from "path";
import { HeadlessResourcesFactory, HeadlessRunnerFactory } from "./runnerFactory";

runService(
    new HeadlessResourcesFactory(),
    new HeadlessRunnerFactory(),
    "headless-agent",
    path.join(__dirname, "../config.json"));
