/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ForemanLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory } from "@fluidframework/server-services-core";
import { generateToken } from "@fluidframework/server-services-utils";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const authEndpoint = config.get("auth:endpoint");
    const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
    const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl);

    const foremanConfig = config.get("foreman");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);

    // Preps message sender.
    await messageSender.initialize();
    return new ForemanLambdaFactory(messageSender, tenantManager, generateToken, foremanConfig.permissions);
}
