/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import * as utils from "@fluidframework/server-services-utils";
import { AriaTransport } from "../ariaTransport";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");

const ariaTransport = new AriaTransport({});
const configFile = path.join(__dirname, "../../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");
const customTransportList: Transport[] = [ariaTransport];
config.set("logger:customTransportList", customTransportList);

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    "riddler",
    config);
