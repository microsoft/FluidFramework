/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BroadcasterLambda, DeliLambdaFactory } from "@microsoft/fluid-server-lambdas";
import { create as createDocumentRouter } from "@microsoft/fluid-server-lambdas-driver";
import { LocalKafka, LocalContext, LocalLambdaController } from "@microsoft/fluid-server-memory-orderer";
import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";

export async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new core.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await client.collection<core.IDocument>(documentsCollectionName);

    const endpoint = config.get("eventHub:endpoint");
    const forwardProducer = new services.EventHubProducer(endpoint, forwardSendTopic);
    const reverseProducer = new services.EventHubProducer(endpoint, reverseSendTopic);

    const redisConfig = config.get("redis");
    const redisOptions: any = { password: redisConfig.pass };
    if (redisConfig.tls) {
        redisOptions.tls = {
            serverName: redisConfig.host,
        };
    }
    const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host, redisOptions);

    const localContext = new LocalContext();
    const localProducer = new LocalKafka();

    const broadcasterLambda = new LocalLambdaController(
        localProducer,
        undefined,
        localContext,
        async (_, context: LocalContext) => new BroadcasterLambda(publisher, localContext));

    await broadcasterLambda.start();

    return new DeliLambdaFactory(mongoManager, collection, forwardProducer, reverseProducer, localProducer);
}

export async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
