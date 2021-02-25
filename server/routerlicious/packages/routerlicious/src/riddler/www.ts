/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as winston from "winston";
import * as utils from "@fluidframework/server-services-utils";
import { configureLogging } from "@fluidframework/server-services";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "@fluidframework/server-routerlicious-base";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    winston,
    "riddler",
    configPath);
