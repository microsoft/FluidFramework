/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory, MongoManager } from "@fluidframework/server-services-core";
import * as bytes from "bytes";
import { Provider } from "nconf";
import { RouteMasterLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");

    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const maxMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));

    const kafkaClientId = config.get("routemaster:clientId");
    const sendTopic = config.get("routemaster:topics:send");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await client.collection(documentsCollectionName);
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const deltas = await client.collection(deltasCollectionName);
    const producer = services.createProducer(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic, maxMessageSize);

    return new RouteMasterLambdaFactory(mongoManager, collection, deltas, producer);
}

export const id = "routemaster";
