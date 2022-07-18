/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as os from "os";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import {
    LocalNodeFactory,
    LocalOrderManager,
    NodeManager,
    ReservationManager,
} from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import * as utils from "@fluidframework/server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import Redis from "ioredis";
import * as winston from "winston";
import * as ws from "ws";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { AlfredRunner } from "./runner";
import { DeltaService } from "./services";

class NodeWebSocketServer implements core.IWebSocketServer {
    private readonly webSocketServer: ws.Server;

    constructor(portNumber: number) {
        this.webSocketServer = new ws.Server({ port: portNumber });
    }
    public on(event: string, listener: (...args: any[]) => void) {
        this.webSocketServer.on(event, listener);
    }
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        this.webSocketServer.close();
        return Promise.resolve();
    }
}

export class OrdererManager implements core.IOrdererManager {
    constructor(
        private readonly globalDbEnabled: boolean,
        private readonly ordererUrl: string,
        private readonly tenantManager: core.ITenantManager,
        private readonly localOrderManager: LocalOrderManager,
        private readonly kafkaFactory: KafkaOrdererFactory,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);

        const messageMetaData = { documentId, tenantId };
        winston.info(`tenant orderer: ${JSON.stringify(tenant.orderer)}`, { messageMetaData });
        Lumberjack.info(
            `tenant orderer: ${JSON.stringify(tenant.orderer)}`,
            getLumberBaseProperties(documentId, tenantId),
        );

        if (tenant.orderer.url !== this.ordererUrl && !this.globalDbEnabled) {
            Lumberjack.error(`Invalid ordering service endpoint`, { messageMetaData });
            return Promise.reject(new Error("Invalid ordering service endpoint"));
        }

        switch (tenant.orderer.type) {
            case "kafka":
                return this.kafkaFactory.create(tenantId, documentId);
            default:
                return this.localOrderManager.get(tenantId, documentId);
        }
    }
}

export class AlfredResources implements core.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: core.IProducer,
        public redisConfig: any,
        public clientManager: core.IClientManager,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public restThrottler: core.IThrottler,
        public socketConnectThrottler: core.IThrottler,
        public socketSubmitOpThrottler: core.IThrottler,
        public socketSubmitSignalThrottler: core.IThrottler,
        public singleUseTokenCache: core.ICache,
        public storage: core.IDocumentStorage,
        public appTenants: IAlfredTenant[],
        public mongoManager: core.MongoManager,
        public deltaService: core.IDeltaService,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any,
        public documentsCollection: core.ICollection<core.IDocument>,
        public throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
        public verifyMaxMessageSize?: boolean,
    ) {
        const socketIoAdapterConfig = config.get("alfred:socketIoAdapter");
        const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
        const socketIoConfig = config.get("alfred:socketIo");
        this.webServerFactory = new services.SocketIoWebServerFactory(
            this.redisConfig,
            socketIoAdapterConfig,
            httpServerConfig,
            socketIoConfig);
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}

export class AlfredResourcesFactory implements core.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Producer used to publish messages
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const kafkaClientId = config.get("alfred:kafkaClientId");
        const topic = config.get("alfred:topic");
        const metricClientConfig = config.get("metric");
        const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
        const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
        const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
        const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
        const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");

        const producer = services.createProducer(
            kafkaLibrary,
            kafkaEndpoint,
            kafkaClientId,
            topic,
            false,
            kafkaProducerPollIntervalMs,
            kafkaNumberOfPartitions,
            kafkaReplicationFactor,
            kafkaMaxBatchSize,
            kafkaSslCACertFilePath);

        const redisConfig = config.get("redis");
        const webSocketLibrary = config.get("alfred:webSocketLib");
        const authEndpoint = config.get("auth:endpoint");

        // Redis connection for client manager and single-use JWTs.
        const redisConfig2 = config.get("redis2");
        const redisOptions2: Redis.RedisOptions = {
            host: redisConfig2.host,
            port: redisConfig2.port,
            password: redisConfig2.pass,
        };
        if (redisConfig2.tls) {
            redisOptions2.tls = {
                servername: redisConfig2.host,
            };
        }

        const redisParams2 = {
            expireAfterSeconds: redisConfig2.keyExpireAfterSeconds as number | undefined,
        };

        const redisClient = new Redis(redisOptions2);
        const clientManager = new services.ClientManager(redisClient, redisParams2);

        const redisClientForJwtCache = new Redis(redisOptions2);
        const redisJwtCache = new services.RedisCache(redisClientForJwtCache);

        // Database connection for global db if enabled
        let globalDbMongoManager;
        const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
        const factory = await services.getDbFactory(config);
        if (globalDbEnabled) {
            globalDbMongoManager = new core.MongoManager(factory, false, null, true);
        }

        // Database connection for operations db
        const operationsDbMongoManager = new core.MongoManager(factory);
        const documentsCollectionName = config.get("mongo:collectionNames:documents");

        // Create the index on the documents collection
        const dbManager = globalDbEnabled ? globalDbMongoManager : operationsDbMongoManager;
        const db: core.IDb = await dbManager.getDatabase();
        const documentsCollection = db.collection<core.IDocument>(documentsCollectionName);
        await documentsCollection.createIndex(
            {
                documentId: 1,
                tenantId: 1,
            },
            true);
        const deltasCollectionName = config.get("mongo:collectionNames:deltas");
        const scribeCollectionName = config.get("mongo:collectionNames:scribeDeltas");

        // Foreman agent uploader does not run locally.
        // TODO: Make agent uploader run locally.
        const foremanConfig = config.get("foreman");
        const taskMessageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);
        await taskMessageSender.initialize();

        const nodeCollectionName = config.get("mongo:collectionNames:nodes");
        const nodeManager = new NodeManager(operationsDbMongoManager, nodeCollectionName);
        // This.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
        const reservationManager = new ReservationManager(
            nodeManager,
            operationsDbMongoManager,
            config.get("mongo:collectionNames:reservations"));

        const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
        const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl);

        // Redis connection for throttling.
        const redisConfigForThrottling = config.get("redisForThrottling");
        const redisOptionsForThrottling: Redis.RedisOptions = {
            host: redisConfigForThrottling.host,
            port: redisConfigForThrottling.port,
            password: redisConfigForThrottling.pass,
        };
        if (redisConfigForThrottling.tls) {
            redisOptionsForThrottling.tls = {
                servername: redisConfigForThrottling.host,
            };
        }
        const redisParamsForThrottling = {
            expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as number | undefined,
        };

        const redisClientForThrottling = new Redis(redisOptionsForThrottling);

        // Rest API Throttler
        const throttleMaxRequestsPerMs =
            config.get("alfred:throttling:restCalls:maxPerMs") as number | undefined;
        const throttleMaxRequestBurst =
            config.get("alfred:throttling:restCalls:maxBurst") as number | undefined;
        const throttleMinRequestCooldownIntervalInMs =
            config.get("alfred:throttling:restCalls:minCooldownIntervalInMs") as number | undefined;
        const throttleMinRequestThrottleIntervalInMs =
            config.get("alfred:throttling:restCalls:minThrottleIntervalInMs") as number | undefined;
        const throttleAndUsageStorageManager =
            new services.RedisThrottleAndUsageStorageManager(redisClientForThrottling, redisParamsForThrottling);
        const restThrottlerHelper = new services.ThrottlerHelper(
            throttleAndUsageStorageManager,
            throttleMaxRequestsPerMs,
            throttleMaxRequestBurst,
            throttleMinRequestCooldownIntervalInMs);
        const restThrottler = new services.Throttler(
            restThrottlerHelper,
            throttleMinRequestThrottleIntervalInMs,
            winston);

        // Socket Connection Throttler
        const throttleMaxSocketConnectionsPerMs =
            config.get("alfred:throttling:socketConnections:maxPerMs") as number | undefined;
        const throttleMaxSocketConnectionBurst =
            config.get("alfred:throttling:socketConnections:maxBurst") as number | undefined;
        const throttleMinSocketConnectionCooldownIntervalInMs =
            config.get("alfred:throttling:socketConnections:minCooldownIntervalInMs") as number | undefined;
        const throttleMinSocketConnectionThrottleIntervalInMs =
            config.get("alfred:throttling:socketConnections:minThrottleIntervalInMs") as number | undefined;
        const socketConnectThrottlerHelper = new services.ThrottlerHelper(
            throttleAndUsageStorageManager,
            throttleMaxSocketConnectionsPerMs,
            throttleMaxSocketConnectionBurst,
            throttleMinSocketConnectionCooldownIntervalInMs,
        );
        const socketConnectThrottler = new services.Throttler(
            socketConnectThrottlerHelper,
            throttleMinSocketConnectionThrottleIntervalInMs,
            winston);

        // Socket SubmitOp Throttler
        const throttleMaxSubmitOpsPerMs =
            config.get("alfred:throttling:submitOps:maxPerMs") as number | undefined;
        const throttleMaxSubmitOpBurst =
            config.get("alfred:throttling:submitOps:maxBurst") as number | undefined;
        const throttleMinSubmitOpCooldownIntervalInMs =
            config.get("alfred:throttling:submitOps:minCooldownIntervalInMs") as number | undefined;
        const throttleMinSubmitOpThrottleIntervalInMs =
            config.get("alfred:throttling:submitOps:minThrottleIntervalInMs") as number | undefined;
        const socketSubmitOpThrottlerHelper = new services.ThrottlerHelper(
            throttleAndUsageStorageManager,
            throttleMaxSubmitOpsPerMs,
            throttleMaxSubmitOpBurst,
            throttleMinSubmitOpCooldownIntervalInMs);
        const socketSubmitOpThrottler = new services.Throttler(
            socketSubmitOpThrottlerHelper,
            throttleMinSubmitOpThrottleIntervalInMs,
            winston);

        // Socket SubmitSignal Throttler
        const throttleMaxSubmitSignalsPerMs =
            config.get("alfred:throttling:submitSignals:maxPerMs") as number | undefined;
        const throttleMaxSubmitSignalBurst =
            config.get("alfred:throttling:submitSignals:maxBurst") as number | undefined;
        const throttleMinSubmitSignalCooldownIntervalInMs =
            config.get("alfred:throttling:submitSignals:minCooldownIntervalInMs") as number | undefined;
        const throttleMinSubmitSignalThrottleIntervalInMs =
            config.get("alfred:throttling:submitSignals:minThrottleIntervalInMs") as number | undefined;
        const socketSubmitSignalThrottlerHelper = new services.ThrottlerHelper(
            throttleAndUsageStorageManager,
            throttleMaxSubmitSignalsPerMs,
            throttleMaxSubmitSignalBurst,
            throttleMinSubmitSignalCooldownIntervalInMs);
        const socketSubmitSignalThrottler = new services.Throttler(
            socketSubmitSignalThrottlerHelper,
            throttleMinSubmitSignalThrottleIntervalInMs,
            winston);

        const databaseManager = new core.MongoDatabaseManager(
            globalDbEnabled,
            operationsDbMongoManager,
            globalDbMongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            scribeCollectionName);

        const enableWholeSummaryUpload = config.get("storage:enableWholeSummaryUpload") as boolean;
        const storage = new services.DocumentStorage(databaseManager, tenantManager, enableWholeSummaryUpload);

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
        // Disable by default because microsoft/FluidFramework/pull/#9223 set chunking to disabled by default.
        // Therefore, default clients will ignore server's 16kb message size limit.
        const verifyMaxMessageSize = config.get("alfred:verifyMaxMessageSize") ?? false;
        const address = `${await utils.getHostIp()}:4000`;

        const nodeFactory = new LocalNodeFactory(
            os.hostname(),
            address,
            storage,
            databaseManager,
            60000,
            () => new NodeWebSocketServer(4000),
            taskMessageSender,
            tenantManager,
            foremanConfig.permissions,
            maxSendMessageSize,
            utils.generateToken,
            winston);
        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const kafkaOrdererFactory = new KafkaOrdererFactory(
            producer,
            maxSendMessageSize,
            core.DefaultServiceConfiguration);
        const serverUrl = config.get("worker:serverUrl");

        const orderManager = new OrdererManager(
            globalDbEnabled,
            serverUrl,
            tenantManager,
            localOrderManager,
            kafkaOrdererFactory);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("alfred:tenants") as { id: string; key: string; }[];

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        const deltaService = new DeltaService(operationsDbMongoManager, tenantManager);

        return new AlfredResources(
            config,
            producer,
            redisConfig,
            clientManager,
            webSocketLibrary,
            orderManager,
            tenantManager,
            restThrottler,
            socketConnectThrottler,
            socketSubmitOpThrottler,
            socketSubmitSignalThrottler,
            redisJwtCache,
            storage,
            appTenants,
            operationsDbMongoManager,
            deltaService,
            port,
            documentsCollectionName,
            metricClientConfig,
            documentsCollection,
            throttleAndUsageStorageManager,
            verifyMaxMessageSize);
    }
}

export class AlfredRunnerFactory implements core.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<core.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.restThrottler,
            resources.socketConnectThrottler,
            resources.socketSubmitOpThrottler,
            resources.socketSubmitSignalThrottler,
            resources.singleUseTokenCache,
            resources.storage,
            resources.clientManager,
            resources.appTenants,
            resources.deltaService,
            resources.producer,
            resources.metricClientConfig,
            resources.documentsCollection,
            resources.throttleAndUsageStorageManager,
            resources.verifyMaxMessageSize);
    }
}
