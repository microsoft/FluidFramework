/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KafkaResourcesFactory } from "@microsoft/fluid-server-routerlicious/dist/kafka-service/resourcesFactory";
import { KafkaRunnerFactory } from "@microsoft/fluid-server-routerlicious/dist/kafka-service/runnerFactory";
import utils from "@microsoft/fluid-server-routerlicious/dist/utils";
import path from "path";

const name = "fluid-metrics";
const lambda = path.join(__dirname, "./plugin.js");

utils.runService(
    new KafkaResourcesFactory(name, lambda),
    new KafkaRunnerFactory(),
    name,
    path.join(__dirname, "../config.json"));
