/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as winston from "winston";
import { configureLogging } from "@fluidframework/server-services-utils";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "@fluidframework/server-routerlicious-base";
import { runService } from "@fluidframework/server-services-shared";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);

runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    winston,
    "riddler",
    configPath);
