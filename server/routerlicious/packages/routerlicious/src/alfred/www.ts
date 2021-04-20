/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as winston from "winston";
import { configureLogging } from "@fluidframework/server-services-utils";
import { AlfredResourcesFactory, AlfredRunnerFactory, runService } from "@fluidframework/server-routerlicious-base";

const configPath = path.join(__dirname, "../../config/config.json");

configureLogging(configPath);

runService(
    new AlfredResourcesFactory(),
    new AlfredRunnerFactory(),
    winston,
    "alfred",
    configPath);
