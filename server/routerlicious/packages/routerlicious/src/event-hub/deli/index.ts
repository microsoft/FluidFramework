/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BroadcasterLambda, DeliLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
import { LocalKafka, LocalContext, LocalLambdaController } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { EventHubProducer } from "@fluidframework/server-services-ordering-eventhub";
import { Provider } from "nconf";
import { RedisOptions } from "ioredis";
import * as winston from "winston";

export async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Generate tenant manager which abstracts access to the underlying storage provider
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new services.TenantManager(authEndpoint);

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new core.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await client.collection<core.IDocument>(documentsCollectionName);

    const endpoint = config.get("eventHub:endpoint");
    const forwardProducer = new EventHubProducer(endpoint, forwardSendTopic);
    const reverseProducer = new EventHubProducer(endpoint, reverseSendTopic);

    const redisConfig = config.get("redis");
    const redisOptions: RedisOptions = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.pass,
    };
    if (redisConfig.tls) {
        redisOptions.tls = {
            servername: redisConfig.host,
        };
    }
    const publisher = new services.SocketIoRedisPublisher(redisOptions);
    publisher.on("error", (err) => {
        winston.error("Error with Redis Publisher:", err);
    });

    const localContext = new LocalContext(winston);

    const localProducer = new LocalKafka();
    const combinedProducer = new core.CombinedProducer([forwardProducer, localProducer]);

    const broadcasterLambda = new LocalLambdaController(
        localProducer,
        undefined,
        localContext,
        async (_, context: LocalContext) => new BroadcasterLambda(publisher, localContext));

    await broadcasterLambda.start();

    return new DeliLambdaFactory(
        mongoManager,
        collection,
        tenantManager,
        combinedProducer,
        reverseProducer,
        core.DefaultServiceConfiguration);
}

export async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
