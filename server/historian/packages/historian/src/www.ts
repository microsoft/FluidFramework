/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import { runService } from "@fluidframework/server-services-utils";
import { HistorianResourcesFactory, HistorianRunnerFactory } from "@fluidframework/historian-base";

const configFile = path.join(__dirname, "../config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");
runService(
    new HistorianResourcesFactory(),
    new HistorianRunnerFactory(),
    "historian",
    config);
