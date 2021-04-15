/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as nconf from "nconf";
import * as winston from "winston";
import { runService } from "@fluidframework/server-routerlicious-base";
import { HistorianResourcesFactory, HistorianRunnerFactory } from "@fluidframework/historian-base";

const configFile = path.join(__dirname, "../config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");
runService(
    new HistorianResourcesFactory(),
    new HistorianRunnerFactory(),
    winston,
    "historian",
    config);
