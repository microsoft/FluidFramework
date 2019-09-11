/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory } from "@microsoft/fluid-server-routerlicious/dist/kafka-service/lambdas";
import * as aria from "aria-nodejs-sdk";
import { Provider } from "nconf";
import { MetricsLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const tenantId = config.get("tenantId");
    const eventName = config.get("eventName");
    const environment = config.get("environment");
    const logger = aria.AWTLogManager.initialize(tenantId);

    return new MetricsLambdaFactory(logger, eventName, environment);
}
