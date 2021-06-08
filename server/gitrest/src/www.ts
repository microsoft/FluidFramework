/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as winston from "winston";
import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import { GitrestResourcesFactory, GitrestRunnerFactory } from "./runnerFactory";

const configPath = path.join(__dirname, "../config.json");

configureLogging(configPath);

runService(
    new GitrestResourcesFactory(),
    new GitrestRunnerFactory(),
    winston,
    "historian",
    configPath);
