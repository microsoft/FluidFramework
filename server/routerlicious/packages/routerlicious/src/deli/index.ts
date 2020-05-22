/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BroadcasterLambda, DeliLambdaFactory } from "@fluidframework/server-lambdas";
import { create as createDocumentRouter } from "@fluidframework/server-lambdas-driver";
import { LocalKafka, LocalContext, LocalLambdaController } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as bytes from "bytes";
import { Provider } from "nconf";
import * as winston from "winston";

export async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const maxMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));

    const kafkaForwardClientId = config.get("deli:kafkaClientId");
    const kafkaReverseClientId = config.get("alfred:kafkaClientId");

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

    const forwardProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaForwardClientId,
        forwardSendTopic,
        maxMessageSize);
    const reverseProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaReverseClientId,
        reverseSendTopic,
        maxMessageSize);

    const redisConfig = config.get("redis");
    const redisOptions: any = { password: redisConfig.pass };
    if (redisConfig.tls) {
        redisOptions.tls = {
            serverName: redisConfig.host,
        };
    }
    const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host, redisOptions);

    const localContext = new LocalContext(winston);

    const localProducer = new LocalKafka();
    const combinedProducer = new core.CombinedProducer([forwardProducer, localProducer]);

    const broadcasterLambda = new LocalLambdaController(
        localProducer,
        undefined,
        localContext,
        async (_, context: LocalContext) => new BroadcasterLambda(publisher, context));

    await broadcasterLambda.start();

    return new DeliLambdaFactory(mongoManager, collection, tenantManager, combinedProducer, reverseProducer);
}

export async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
