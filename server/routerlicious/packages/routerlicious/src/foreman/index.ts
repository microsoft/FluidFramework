/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ForemanLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(authEndpoint);

    const foremanConfig = config.get("foreman");
    // Service developers can swap between implementations of messageSender by changing the rabbitMqConfig connectionStr
    const messageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);

    // Preps message sender.
    await messageSender.initialize();
    return new ForemanLambdaFactory(messageSender, tenantManager, foremanConfig.permissions);
}
