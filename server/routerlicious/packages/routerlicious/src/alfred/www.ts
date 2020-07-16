/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import * as winston from "winston";
import { runService } from "@fluidframework/server-services-utils";
// eslint-disable-next-line import/no-internal-modules
import { AriaTransport, getMetaDataFromProcess } from "../telemetry/ariaTransport";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");

const configFile = path.join(__dirname, "../../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");
const eventName = "routerlicious";
const metaData = getMetaDataFromProcess();
// eslint-disable-next-line dot-notation
metaData["serviceName"] = "alfred";
const tenantToken = "978e115fcf9846189c84c44420044563-b891ade9-bd2a-4311-980a-539bfafe846a-7201";
const ariaTransport = new AriaTransport({ eventName, metaData, tenantToken, format: winston.format.uncolorize() });
const customTransportList: Transport[] = [ariaTransport];
config.set("logger:additionalTransportList", customTransportList);

runService(
    new AlfredResourcesFactory(),
    new AlfredRunnerFactory(),
    "alfred",
    config);
