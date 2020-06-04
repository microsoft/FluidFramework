/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import * as utils from "@fluidframework/server-services-utils";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

const configFile = path.join(__dirname, "../../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    "riddler",
    config);
