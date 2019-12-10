/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import * as redis from "redis";
import { BBCLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
    if (redisConfig.tls) {
        redisOptions.tls = {
            serverName: redisConfig.host,
        };
    }

    const publisher = redis.createClient(redisConfig.port, redisConfig.host, redisOptions);

    return new BBCLambdaFactory(publisher);
}
