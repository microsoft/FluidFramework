/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ForemanLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { IPartitionLambdaFactory } from "@prague/services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(
        authEndpoint,
        config.get("worker:blobStorageUrl"));

    const foremanConfig = config.get("foreman");
    const messageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);

    // Preps message sender.
    await messageSender.initialize();
    return new ForemanLambdaFactory(messageSender, tenantManager, foremanConfig.permissions);
}
