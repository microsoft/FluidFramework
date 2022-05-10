/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BroadcasterLambda, DeliLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
import { LocalKafka, LocalContext, LocalLambdaController } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { RedisOptions } from "ioredis";
import * as winston from "winston";
import { IDb, IDeliCheckpointHeuristicsServerConfiguration, MongoManager } from "@fluidframework/server-services-core";

export async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
    const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
    const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
    const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
    const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");

    const kafkaForwardClientId = config.get("deli:kafkaClientId");
    const kafkaReverseClientId = config.get("alfred:kafkaClientId");

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Generate tenant manager which abstracts access to the underlying storage provider
    const authEndpoint = config.get("auth:endpoint");
    const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
    const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl);
    const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;

    // Database connection for global db if enabled
    const factory = await services.getDbFactory(config);

    const checkpointHeuristics = config.get("deli:checkpointHeuristics") as
                            IDeliCheckpointHeuristicsServerConfiguration;
    if (checkpointHeuristics && checkpointHeuristics.enable) {
        core.DefaultServiceConfiguration.deli.checkpointHeuristics = checkpointHeuristics;
    }

    let globalDb;
    let globalDbManager;
    if (globalDbEnabled) {
        globalDbManager = new MongoManager(factory, false, null, true);
        globalDb = await globalDbManager.getDatabase();
    }

    const operationsDbManager = new MongoManager(factory, false);
    const operationsDb = await operationsDbManager.getDatabase();

    const db: IDb = globalDbEnabled ? globalDb : operationsDb;

    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<core.IDocument>(documentsCollectionName);

    const forwardProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaForwardClientId,
        forwardSendTopic,
        true,
        kafkaProducerPollIntervalMs,
        kafkaNumberOfPartitions,
        kafkaReplicationFactor,
        kafkaMaxBatchSize,
        kafkaSslCACertFilePath);
    const reverseProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaReverseClientId,
        reverseSendTopic,
        false,
        kafkaProducerPollIntervalMs,
        kafkaNumberOfPartitions,
        kafkaReplicationFactor,
        kafkaMaxBatchSize,
        kafkaSslCACertFilePath);

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
        Lumberjack.error("Error with Redis Publisher:", undefined, err);
    });

    const localContext = new LocalContext(winston);

    const localProducer = new LocalKafka();
    const combinedProducer = new core.CombinedProducer([forwardProducer, localProducer], true);

    const broadcasterLambda = new LocalLambdaController(
        localProducer,
        undefined,
        localContext,
        async (_, context: LocalContext) =>
            new BroadcasterLambda(publisher, context, core.DefaultServiceConfiguration, undefined));

    await broadcasterLambda.start();

    return new DeliLambdaFactory(
        operationsDbManager,
        collection,
        tenantManager,
        undefined,
        combinedProducer,
        undefined,
        reverseProducer,
        core.DefaultServiceConfiguration);
}

export async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
